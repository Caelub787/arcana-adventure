import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useSearch, useRoute } from "wouter";
import { motion } from "framer-motion";
import { CharacterCreation, BattleMap, CampaignMenu, CharacterSheet, BattleMapHotbars, SelectionModeButtons, InitiativeTracker, type SelectionMode } from "@/components/game/GameComponents";
import { BattlemapDiceOverlay, triggerBattlemapDiceRoll } from "@/components/game/BattlemapDiceOverlay";
import { type AoeTargetState, createInitialAoeState } from "@/lib/aoeHelpers";
import { RollNotificationContainer, triggerInitiativeNotification, triggerEffectRollNotification, getNotificationStyle, setNotificationStyle, type NotificationStyle } from "@/components/game/RollNotification";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Settings, Map as MapIcon, Layers, Trash2, MessageSquare, User, BarChart3, Zap, Backpack, Sparkles, Grid3X3, ScrollText, Swords, Dices, Users, Dna, Edit2, Bell, FileText, X, ChevronLeft, Network, List } from "lucide-react";
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
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ImageBrowser } from "@/components/ImageBrowser";
import { NotesGraph } from "@/components/notes/NotesGraph";
import { Folder, FolderPlus, Plus, GripVertical, Eye, Radio, ChevronDown, ChevronRight, Pencil } from "lucide-react";

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

export default function Campaign() {
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const [match, params] = useRoute("/campaign/:id");
  const queryParams = new URLSearchParams(search);
  const isNew = queryParams.get("new") === "true";
  const campaignId = params?.id;

  const { user, isAdmin } = useAuth();
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
  const [campaignSpeciesOpen, setCampaignSpeciesOpen] = useState(false);
  const [editingSpecies, setEditingSpecies] = useState<CampaignSpecies | null>(null);
  const [speciesFormOpen, setSpeciesFormOpen] = useState(false);
  const [deletingSpecies, setDeletingSpecies] = useState<CampaignSpecies | null>(null);
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
  const [throwableGridTarget, setThrowableGridTarget] = useState<{ x: number; y: number } | null>(null);
  
  // Active beacons state - temporary pulsating rings on grid cells
  const [activeBeacons, setActiveBeacons] = useState<Array<{
    id: string;
    gridX: number;
    gridY: number;
    username: string;
  }>>([]);
  
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
  
  // Notes panel state
  const [notesPanelOpen, setNotesPanelOpen] = useState(false);
  const [selectedCampaignNote, setSelectedCampaignNote] = useState<Note | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [notesViewMode, setNotesViewMode] = useState<"list" | "graph">("list");
  const debouncedNoteTitle = useDebouncedValue(noteTitle, 1000);
  const debouncedNoteContent = useDebouncedValue(noteContent, 1000);
  
  // Memoized callback for notes toggle to prevent infinite re-renders
  const handleToggleNotesPanel = useCallback(() => {
    setNotesPanelOpen(prev => !prev);
  }, []);
  
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
    
    // Debounce viewport broadcasts to every 200ms
    const now = Date.now();
    if (now - lastViewportBroadcastRef.current >= 200) {
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

  // Load campaign data from API
  const { data: campaign, isLoading: campaignLoading } = useQuery({
    queryKey: [`/api/campaigns/${effectiveCampaignId}`],
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

  // Determine which scene ID to use for tokens
  // For GM: use gmViewingSceneId if set, otherwise use activeSceneId
  // For Players: always use activeSceneId
  const sceneIdForTokens = role === 'gm' && gmViewingSceneId ? gmViewingSceneId : campaignActiveSceneId;
  
  // Load tokens for the current scene
  const { data: tokensData, isLoading: tokensLoading } = useQuery({
    queryKey: [`/api/campaigns/${effectiveCampaignId}/tokens`, sceneIdForTokens],
    queryFn: () => api.getCampaignTokens(effectiveCampaignId!, sceneIdForTokens || undefined),
    enabled: !!effectiveCampaignId && !isNew && !!sceneIdForTokens,
    staleTime: 0, // Always refetch to get latest token positions
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

  // Load system species for default token images (only needed when campaign is loaded)
  const { data: systemSpecies } = useQuery({
    queryKey: ['/api/admin/system-species'],
    queryFn: () => api.getSystemSpecies(),
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
  const { data: featTrees = [] } = useQuery<FeatTree[]>({
    queryKey: ['/api/admin/feat-trees'],
    queryFn: () => api.getFeatTrees(),
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

  // Campaign notes query and mutations
  const { data: campaignNotes = [], isLoading: notesLoading } = useQuery<Note[]>({
    queryKey: ['/api/notes', effectiveCampaignId],
    queryFn: () => api.getNotes(undefined, effectiveCampaignId!),
    enabled: !!effectiveCampaignId && notesPanelOpen,
  });

  const createNoteMutation = useMutation({
    mutationFn: (data: Partial<Note>) => api.createNote(data),
    onSuccess: (newNote) => {
      queryClient.invalidateQueries({ queryKey: ['/api/notes', effectiveCampaignId] });
      setSelectedCampaignNote(newNote);
      setNoteTitle(newNote.title);
      setNoteContent(newNote.content || "");
      toast({ title: "Note created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateNoteMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Note> }) => api.updateNote(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notes', effectiveCampaignId] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (id: string) => api.deleteNote(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notes', effectiveCampaignId] });
      setSelectedCampaignNote(null);
      setNoteTitle("");
      setNoteContent("");
      toast({ title: "Note deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Auto-save note changes
  useEffect(() => {
    if (selectedCampaignNote && (debouncedNoteTitle !== selectedCampaignNote.title || debouncedNoteContent !== (selectedCampaignNote.content || ""))) {
      updateNoteMutation.mutate({
        id: selectedCampaignNote.id,
        data: { title: debouncedNoteTitle, content: debouncedNoteContent },
      });
    }
  }, [debouncedNoteTitle, debouncedNoteContent]);

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
    mutationFn: (name: string) => api.createCampaign(name),
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

  // Toggle token invisibility mutation
  const toggleInvisibilityMutation = useMutation({
    mutationFn: ({ tokenId, isInvisible }: { tokenId: string; isInvisible: boolean }) => 
      api.updateToken(tokenId, { isInvisible } as any),
    onSuccess: (_, { isInvisible }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}/tokens`] });
      toast({ title: isInvisible ? 'Token hidden from players' : 'Token visible to players' });
    },
    onError: () => {
      toast({ title: 'Failed to toggle invisibility', variant: 'destructive' });
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

  // WebSocket connection
  useEffect(() => {
    if (effectiveCampaignId && !wsConnectedRef.current) {
      gameWs.connect(effectiveCampaignId);
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
          // Update viewingCharacterSheet if it matches (for character sheet dialog)
          setViewingCharacterSheet((prev: any) => {
            if (prev && prev.id === updatedChar.id) {
              return updatedChar;
            }
            return prev;
          });
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
          const { id, gridX, gridY, username } = data;
          
          // Add the new beacon
          setActiveBeacons(prev => [...prev, { id, gridX, gridY, username }]);
          
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
  
  // Handler for creating a beacon at a grid cell
  const handleBeacon = (cellKey: string) => {
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
            <ArrowLeft style={{ filter: 'drop-shadow(0 0 2px black) drop-shadow(0 0 2px black) drop-shadow(0 0 1px black)' }} />
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
                  <MessageSquare className="h-5 w-5" style={{ filter: 'drop-shadow(0 0 2px black) drop-shadow(0 0 2px black) drop-shadow(0 0 1px black)' }} />
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
                    <Dices className="h-5 w-5" style={{ filter: 'drop-shadow(0 0 2px black) drop-shadow(0 0 2px black) drop-shadow(0 0 1px black)' }} />
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
            onOpenCampaignSpecies={() => setCampaignSpeciesOpen(true)}
            isOwner={!!(campaign && typeof campaign === 'object' && 'gmUserId' in campaign && (campaign as any).gmUserId === user?.id)}
            gmUserId={(campaign && typeof campaign === 'object' && 'gmUserId' in campaign ? (campaign as any).gmUserId as string : undefined)}
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
                    <Layers className="h-5 w-5" style={{ filter: 'drop-shadow(0 0 2px black) drop-shadow(0 0 2px black) drop-shadow(0 0 1px black)' }} />
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
                  <Swords className="h-5 w-5" style={{ filter: 'drop-shadow(0 0 2px black) drop-shadow(0 0 2px black) drop-shadow(0 0 1px black)' }} />
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
             notesPanelOpen={notesPanelOpen}
             onNotesClick={handleToggleNotesPanel}
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
                 <div className="absolute left-2 md:left-4 top-72 z-30 pointer-events-auto bg-stone-900/95 border border-stone-700 rounded-lg p-3 shadow-xl w-48">
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
           {(role === 'gm' ? inspectedChar : character) && (
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
        <DialogContent className="w-full h-full max-w-full max-h-full sm:max-w-4xl sm:h-[90vh] sm:max-h-[90vh] bg-stone-900 border-stone-700 text-stone-200 p-0 rounded-none sm:rounded-lg flex flex-col">
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
              isAdmin={isAdmin}
              accessLevel={
                viewingCharacterSheet.userId === user?.id ? 'owner' :
                (myPermissions?.permissions?.[viewingCharacterSheet.id] as 'name' | 'view' | 'edit' | undefined) || 'view'
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
        userId={user?.id}
      />
      
      {/* Notes Panel Overlay */}
      {notesPanelOpen && (
        <div className="fixed top-0 right-0 h-full z-40 pointer-events-auto" style={{ width: '400px', maxWidth: '90vw' }}>
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizableHandle withHandle className="bg-stone-700 hover:bg-amber-600 transition-colors" />
            <ResizablePanel defaultSize={100} minSize={30}>
              <div className="h-full bg-stone-900/98 border-l border-stone-700 flex flex-col shadow-2xl">
                {/* Panel Header */}
                <div className="flex items-center justify-between p-3 border-b border-stone-700 bg-stone-900">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-amber-500" />
                    <h2 className="text-lg font-bold text-amber-500">Campaign Notes</h2>
                  </div>
                  <div className="flex items-center gap-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setNotesViewMode(notesViewMode === "list" ? "graph" : "list")}
                            className={`text-stone-400 hover:text-white hover:bg-stone-700 ${notesViewMode === "graph" ? 'bg-amber-900/50 text-amber-400' : ''}`}
                            data-testid="button-toggle-notes-view"
                          >
                            {notesViewMode === "list" ? <Network className="h-4 w-4" /> : <List className="h-4 w-4" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="bg-stone-800 border-stone-700 text-stone-200">
                          <p>{notesViewMode === "list" ? "Graph View" : "List View"}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setNotesPanelOpen(false)}
                      className="text-stone-400 hover:text-white hover:bg-stone-700"
                      data-testid="button-close-notes"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
                
                {/* Notes Content Area */}
                <div className="flex-1 flex overflow-hidden">
                  {notesViewMode === "graph" ? (
                    <NotesGraph
                      notes={campaignNotes}
                      onNoteClick={(noteId) => {
                        const note = campaignNotes.find(n => n.id === noteId);
                        if (note) {
                          setSelectedCampaignNote(note);
                          setNoteTitle(note.title);
                          setNoteContent(note.content || "");
                          setNotesViewMode("list");
                        }
                      }}
                    />
                  ) : (
                    <>
                      {/* Notes Sidebar */}
                      <div className="w-1/3 min-w-[120px] border-r border-stone-700 flex flex-col bg-stone-950/50">
                        {/* New Note Button */}
                        <div className="p-2 border-b border-stone-700">
                          <Button
                            size="sm"
                            onClick={() => {
                              createNoteMutation.mutate({
                                title: "New Note",
                                content: "",
                                campaignId: effectiveCampaignId || undefined,
                                type: "text",
                                isPinned: false,
                                isArchived: false,
                                sortOrder: 0,
                              });
                            }}
                            className="w-full bg-amber-700 hover:bg-amber-600 text-white text-xs"
                            disabled={createNoteMutation.isPending}
                            data-testid="button-create-note"
                          >
                            {createNoteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
                            New Note
                          </Button>
                        </div>
                        
                        {/* Notes List */}
                        <ScrollArea className="flex-1">
                          {notesLoading ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                            </div>
                          ) : campaignNotes.length === 0 ? (
                            <div className="p-3 text-center text-stone-500 text-xs">
                              No notes yet. Create one to get started!
                            </div>
                          ) : (
                            <div className="p-1">
                              {campaignNotes.map((note) => (
                                <button
                                  key={note.id}
                                  onClick={() => {
                                    setSelectedCampaignNote(note);
                                    setNoteTitle(note.title);
                                    setNoteContent(note.content || "");
                                  }}
                                  className={`w-full text-left p-2 rounded mb-1 transition-colors ${
                                    selectedCampaignNote?.id === note.id
                                      ? 'bg-amber-900/40 text-amber-200 border border-amber-700'
                                      : 'hover:bg-stone-800 text-stone-300 border border-transparent'
                                  }`}
                                  data-testid={`note-item-${note.id}`}
                                >
                                  <div className="text-sm font-medium truncate">{note.title}</div>
                                  <div className="text-xs text-stone-500 truncate">
                                    {note.content?.slice(0, 30) || "Empty note"}
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </ScrollArea>
                      </div>
                      
                      {/* Note Editor */}
                      <div className="flex-1 flex flex-col overflow-hidden">
                        {selectedCampaignNote ? (
                          <>
                            {/* Note Title */}
                            <div className="p-3 border-b border-stone-700">
                              <Input
                                value={noteTitle}
                                onChange={(e) => setNoteTitle(e.target.value)}
                                className="bg-stone-800 border-stone-600 text-stone-100 font-medium"
                                placeholder="Note title..."
                                data-testid="input-note-title"
                              />
                            </div>
                            
                            {/* Note Content */}
                            <div className="flex-1 p-3 overflow-hidden">
                              <Textarea
                                value={noteContent}
                                onChange={(e) => setNoteContent(e.target.value)}
                                className="h-full w-full bg-stone-800 border-stone-600 text-stone-200 resize-none"
                                placeholder="Write your notes here..."
                                data-testid="textarea-note-content"
                              />
                            </div>
                            
                            {/* Note Actions */}
                            <div className="p-2 border-t border-stone-700 flex items-center justify-between">
                              <span className="text-xs text-stone-500">
                                {updateNoteMutation.isPending ? (
                                  <span className="flex items-center gap-1">
                                    <Loader2 className="h-3 w-3 animate-spin" /> Saving...
                                  </span>
                                ) : (
                                  'Auto-saved'
                                )}
                              </span>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                                    data-testid="button-delete-note"
                                  >
                                    <Trash2 className="h-3 w-3 mr-1" /> Delete
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="bg-stone-900 border-stone-700">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle className="text-red-400">Delete Note</AlertDialogTitle>
                                    <AlertDialogDescription className="text-stone-400">
                                      Are you sure you want to delete "{selectedCampaignNote.title}"? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel className="bg-stone-800 border-stone-700 text-stone-200 hover:bg-stone-700">
                                      Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteNoteMutation.mutate(selectedCampaignNote.id)}
                                      className="bg-red-900 hover:bg-red-800 text-white"
                                      disabled={deleteNoteMutation.isPending}
                                    >
                                      {deleteNoteMutation.isPending ? "Deleting..." : "Delete"}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </>
                        ) : (
                          <div className="flex-1 flex items-center justify-center text-stone-500">
                            <div className="text-center">
                              <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                              <p className="text-sm">Select a note to view</p>
                              <p className="text-xs mt-1">or create a new one</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}
    </div>
  );
}