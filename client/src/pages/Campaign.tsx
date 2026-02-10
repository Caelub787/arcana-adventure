import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useLocation, useSearch, useRoute } from "wouter";
import { motion } from "framer-motion";
import { CharacterCreation, BattleMap, CampaignMenu, CharacterSheet, BattleMapHotbars, InitiativeTracker, SelectionModeButtons, type SelectionMode } from "@/components/game/GameComponents";
import { BattlemapDiceOverlay, triggerBattlemapDiceRoll } from "@/components/game/BattlemapDiceOverlay";
import { type AoeTargetState, createInitialAoeState, getTokensInAoe } from "@/lib/aoeHelpers";
import { RollNotificationContainer, triggerInitiativeNotification, triggerEffectRollNotification, getNotificationStyle, setNotificationStyle, type NotificationStyle } from "@/components/game/RollNotification";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Settings, Map as MapIcon, Layers, Trash2, MessageSquare, User, BarChart3, Zap, Backpack, Sparkles, Grid3X3, ScrollText, Swords, Dices, Users, Dna, Edit2, Bell, FileText, X, ChevronLeft, Network, List, BookOpen, Send, Pin, Upload, Search, Package } from "lucide-react";
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
import { Folder, FolderOpen, FolderPlus, Plus, GripVertical, Eye, Radio, ChevronDown, ChevronRight, Pencil, Minus, Copy, Palette, Coffee } from "lucide-react";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent } from "@/components/ui/context-menu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PropertyStyleEditor, getPropertyCssStyle, type PropertyStyle } from "@/components/sandbox/PropertyStyleEditor";
import { migrateTemplateData } from "@/components/sandbox/types";
import { evaluateExpression, ExpressionContext } from '@/components/sandbox/expressionEngine';
import { rollDice, formatRollResult, isDiceExpression, DiceRollResult } from '@/components/sandbox/diceEngine';

// Scene Settings Form Component
function SceneSettingsForm({ scene, onUpdateScene }: { scene: Scene; onUpdateScene: (settings: Partial<Scene>) => void }) {
  const [localSettings, setLocalSettings] = useState({
    gridEnabled: scene.gridEnabled,
    gridType: scene.gridType,
    gridSize: scene.gridSize,
    gridColor: scene.gridColor || '#ffffff',
    gridThickness: scene.gridThickness ?? 1,
    gridOpacity: scene.gridOpacity ?? 0.4,
    gridOffsetX: (scene as any).gridOffsetX ?? 0,
    gridOffsetY: (scene as any).gridOffsetY ?? 0,
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
    if (key === 'gridSize' || key === 'gridThickness' || key === 'gridOpacity' || key === 'gridOffsetX' || key === 'gridOffsetY') {
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
          <div className="flex items-center gap-2">
            <input
              type="range"
              id="grid-size"
              min="10"
              max="200"
              value={Math.min(200, Math.max(10, localSettings.gridSize))}
              onChange={(e) => updateSetting('gridSize', parseInt(e.target.value))}
              className="flex-1 accent-amber-600"
              data-testid="slider-grid-size"
            />
            <input
              type="number"
              min="1"
              value={localSettings.gridSize}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val > 0) updateSetting('gridSize', val);
              }}
              className="w-16 bg-stone-800 border border-stone-700 text-stone-200 rounded px-2 py-1 text-sm text-center"
              data-testid="input-grid-size"
            />
          </div>
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

      {/* Grid Offset */}
      {localSettings.gridEnabled && (
        <div className="space-y-2">
          <Label className="text-stone-300">Grid Offset</Label>
          <div className="flex gap-3">
            <div className="flex-1">
              <div className="flex justify-between mb-1">
                <span className="text-xs text-stone-400">X</span>
                <span className="text-xs text-amber-500">{localSettings.gridOffsetX}px</span>
              </div>
              <input
                type="range"
                min={-Math.max(localSettings.gridSize, 50)}
                max={Math.max(localSettings.gridSize, 50)}
                value={localSettings.gridOffsetX}
                onChange={(e) => updateSetting('gridOffsetX', parseInt(e.target.value))}
                className="w-full accent-amber-600"
                data-testid="slider-grid-offset-x"
              />
            </div>
            <div className="flex-1">
              <div className="flex justify-between mb-1">
                <span className="text-xs text-stone-400">Y</span>
                <span className="text-xs text-amber-500">{localSettings.gridOffsetY}px</span>
              </div>
              <input
                type="range"
                min={-Math.max(localSettings.gridSize, 50)}
                max={Math.max(localSettings.gridSize, 50)}
                value={localSettings.gridOffsetY}
                onChange={(e) => updateSetting('gridOffsetY', parseInt(e.target.value))}
                className="w-full accent-amber-600"
                data-testid="slider-grid-offset-y"
              />
            </div>
          </div>
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
    visionType: string;
    dayVisionDistance: number | string;
    nightVisionDistance: number | string;
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
    visionType: 'normal',
    dayVisionDistance: 120,
    nightVisionDistance: 60,
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
        visionType: (initialData as any)?.visionType || 'normal',
        dayVisionDistance: (initialData as any)?.dayVisionDistance ?? 120,
        nightVisionDistance: (initialData as any)?.nightVisionDistance ?? 60,
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
      visionType: formData.visionType || 'normal',
      dayVisionDistance: Number(formData.dayVisionDistance) || 120,
      nightVisionDistance: Number(formData.nightVisionDistance) || 60,
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

              <div className="col-span-2 border-t border-stone-700 pt-3 mt-2">
                <Label className="text-sm font-semibold text-stone-300">Vision</Label>
              </div>

              <div className="col-span-2">
                <Label>Vision Type</Label>
                <Select value={formData.visionType} onValueChange={(value) => setFormData({ ...formData, visionType: value })}>
                  <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-campaign-species-visiontype">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="darkvision">Darkvision</SelectItem>
                    <SelectItem value="blindsight">Blindsight</SelectItem>
                    <SelectItem value="truesight">Truesight</SelectItem>
                    <SelectItem value="tremorsense">Tremorsense</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Day Vision Distance (ft)</Label>
                <Input
                  type="number"
                  value={formData.dayVisionDistance}
                  onChange={(e) => handleNumericChange('dayVisionDistance', e.target.value)}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-campaign-species-dayvision"
                />
              </div>

              <div>
                <Label>Night Vision Distance (ft)</Label>
                <Input
                  type="number"
                  value={formData.nightVisionDistance}
                  onChange={(e) => handleNumericChange('nightVisionDistance', e.target.value)}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-campaign-species-nightvision"
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

function SidePanelChat({ campaignId, role, members }: { campaignId: string; role: string; members?: any[] }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Array<{ id: string; userId?: string; sender: string; text: string; createdAt: string; type?: string; recipientId?: string; recipientName?: string }>>([]);
  const [chatTarget, setChatTarget] = useState<string>('all');
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
    const text = message.trim();

    const rollMatch = text.match(/^\/roll\s+(.+)$/i);
    if (rollMatch) {
      try {
        const result = rollDice(rollMatch[1]);
        const rollText = formatRollResult(result);
        const rollMsg = `rolled ${rollMatch[1]}: ${rollText}`;
        if (chatTarget !== 'all') {
          const targetMember = (members || []).find((m: any) => m.userId === chatTarget);
          gameWs.sendChatMessage(user?.id || '', user?.username || '', rollMsg, 'whisper', chatTarget, targetMember?.username || '');
        } else {
          gameWs.sendChatMessage(user?.id || '', user?.username || '', rollMsg, 'roll');
        }
      } catch (err: any) {
        toast({ title: "Invalid dice expression", description: err.message || "Could not parse dice formula", variant: "destructive" });
      }
      setMessage('');
      return;
    }

    if (chatTarget !== 'all') {
      const targetMember = (members || []).find((m: any) => m.userId === chatTarget);
      gameWs.sendChatMessage(user?.id || '', user?.username || '', text, 'whisper', chatTarget, targetMember?.username || '');
    } else {
      gameWs.sendChatMessage(user?.id || '', user?.username || '', text, 'chat');
    }
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

  const otherMembers = (members || []).filter((m: any) => m.userId !== user?.id);

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
            const isWhisper = msg.type === 'whisper';
            const rollTotal = isRoll ? parseRollTotal(msg.text) : null;
            const isMe = msg.userId === user?.id;
            return (
              <div key={msg.id || i} className={`${isRoll ? 'bg-amber-900/20 border border-amber-800/30 rounded-lg p-2' : ''} ${isWhisper ? 'bg-purple-900/20 border border-purple-800/30 rounded-lg p-2' : ''}`}>
                <div className="flex items-start gap-2">
                  <span className={`text-xs font-bold shrink-0 ${isWhisper ? 'text-purple-400' : isMe ? 'text-amber-400' : 'text-stone-400'}`}>
                    {msg.sender}
                  </span>
                  {isWhisper && (
                    <span className="text-[10px] text-purple-400/70 shrink-0">
                      {isMe ? `to ${msg.recipientName || 'someone'}` : 'whispers'}
                    </span>
                  )}
                  <span className="text-xs text-stone-500 shrink-0">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className={`text-sm mt-0.5 ${isRoll ? 'text-amber-200 font-mono text-xs' : isWhisper ? 'text-purple-200 italic' : 'text-stone-300'}`}>
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
        <div className="flex items-center gap-1 mb-1.5">
          <span className="text-[10px] text-stone-500">To:</span>
          <select
            value={chatTarget}
            onChange={(e) => setChatTarget(e.target.value)}
            className="bg-stone-800 border border-stone-700 text-stone-200 text-xs rounded px-1.5 py-0.5 h-6 min-w-0 flex-1 max-w-[160px]"
            data-testid="select-chat-target"
          >
            <option value="all">All</option>
            {otherMembers.map((m: any) => (
              <option key={m.userId} value={m.userId}>
                {m.username} {m.role === 'gm' ? '(GM)' : m.role === 'assistant_gm' ? '(Asst. GM)' : ''}
              </option>
            ))}
          </select>
          {chatTarget !== 'all' && (
            <span className="text-[10px] text-purple-400">Private</span>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={chatTarget !== 'all' ? "Private message..." : "Type a message or /roll 1d20..."}
            className={`h-9 text-sm ${chatTarget !== 'all' ? 'bg-purple-900/20 border-purple-700 text-purple-200' : 'bg-stone-800 border-stone-700 text-stone-200'}`}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            data-testid="input-chat-message"
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!message.trim()}
            className={`h-9 ${chatTarget !== 'all' ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-amber-600 hover:bg-amber-700 text-white'}`}
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
  role,
  zIndex = 45,
  onBringToFront,
  enterAoeMode,
  tokens,
  activeScene,
  setPendingSandboxAoe
}: { 
  item: { id: string; name: string; type: 'actor' | 'template'; templateId?: string | null; data?: string };
  campaignId: string;
  onClose: () => void;
  isMobile: boolean;
  templates: any[];
  role: string;
  zIndex?: number;
  onBringToFront?: () => void;
  enterAoeMode?: (spell: any, casterTokenId: string) => void;
  tokens?: any[];
  activeScene?: any;
  setPendingSandboxAoe?: (pending: { rollFormula: string; hitFormula?: string; damageFormula?: string; context: Record<string, any>; actorName: string; buttonLabel: string; } | null) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [collapsed, setCollapsed] = useState(false);
  const [position, setPosition] = useState({ x: 100 + Math.random() * 200, y: 80 + Math.random() * 100 });
  const [lastRollResult, setLastRollResult] = useState<DiceRollResult | null>(null);
  const [rollResultVisible, setRollResultVisible] = useState(false);
  const rollResultTimeoutRef = useRef<any>(null);

  const interpolateColor = (color1: string, color2: string, t: number): string => {
    const hex = (c: string) => {
      const h = c.replace('#', '');
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    };
    const [r1, g1, b1] = hex(color1);
    const [r2, g2, b2] = hex(color2);
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };

  const getBarColor = (current: number, max: number, prop: any) => {
    if (max <= 0) return prop.barColor || '#d97706';
    const percent = (current / max) * 100;

    if (prop.useGradient && prop.colorThresholds?.length >= 2) {
      const sorted = [...prop.colorThresholds].sort((a: any, b: any) => a.percent - b.percent);
      let lower = sorted[0];
      let upper = sorted[sorted.length - 1];
      for (let i = 0; i < sorted.length - 1; i++) {
        if (percent >= sorted[i].percent && percent <= sorted[i + 1].percent) {
          lower = sorted[i];
          upper = sorted[i + 1];
          break;
        }
      }
      const t = upper.percent === lower.percent ? 0 : (percent - lower.percent) / (upper.percent - lower.percent);
      return interpolateColor(lower.color, upper.color, Math.max(0, Math.min(1, t)));
    }

    if (prop.colorThresholds?.length) {
      const sorted = [...prop.colorThresholds].sort((a: any, b: any) => b.percent - a.percent);
      for (const threshold of sorted) {
        if (percent <= threshold.percent) {
          return threshold.color;
        }
      }
      return prop.barColor || '#22c55e';
    }

    return prop.barColor || '#d97706';
  };

  const templateData = useMemo(() => {
    try {
      let raw: any = {};
      if (item.type === 'template') {
        const liveTemplate = templates.find((t: any) => t.id === item.id);
        raw = JSON.parse((liveTemplate?.data || item.data) || '{}');
      } else {
        const linkedTemplate = templates.find((t: any) => t.id === item.templateId);
        raw = linkedTemplate ? JSON.parse(linkedTemplate.data || '{}') : {};
      }
      
      return migrateTemplateData(raw);
    } catch { return migrateTemplateData({}); }
  }, [item, templates]);

  const settings = templateData.settings || {};
  const [size, setSize] = useState({ 
    width: settings.defaultWidth || 450, 
    height: settings.defaultHeight || 550 
  });

  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 });
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(item.templateId || null);
  const [showActorSettings, setShowActorSettings] = useState(false);
  const [showTemplateSettings, setShowTemplateSettings] = useState(false);
  const [showRestMenu, setShowRestMenu] = useState(false);

  const [addingProperty, setAddingProperty] = useState(false);
  const [newPropKey, setNewPropKey] = useState('');
  const [newPropLabel, setNewPropLabel] = useState('');
  const [newPropType, setNewPropType] = useState<string>('text');
  const [newPropOptions, setNewPropOptions] = useState('');
  const [newPropDefault, setNewPropDefault] = useState('');
  const [newPropX, setNewPropX] = useState(10);
  const [newPropY, setNewPropY] = useState(10);
  const [newPropWidth, setNewPropWidth] = useState(200);
  const [newPropHeight, setNewPropHeight] = useState(40);
  const [newPropLabelFontSize, setNewPropLabelFontSize] = useState(11);
  const [newPropValueFontSize, setNewPropValueFontSize] = useState(13);
  const [newPropLabelPosition, setNewPropLabelPosition] = useState<string>('top');
  const [newPropTooltip, setNewPropTooltip] = useState('');
  const [newPropStyle, setNewPropStyle] = useState<PropertyStyle>({});
  const [newPropCreatorPos, setNewPropCreatorPos] = useState({ x: 200, y: 100 });
  const [isNewPropDragging, setIsNewPropDragging] = useState(false);
  const newPropDragRef = useRef({ x: 0, y: 0, startX: 0, startY: 0 });
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [propSettingsOpen, setPropSettingsOpen] = useState(false);
  const [propContextMenu, setPropContextMenu] = useState<{ x: number; y: number; propId: string } | null>(null);
  const [sectionContextMenu, setSectionContextMenu] = useState<{ x: number; y: number; sectionId: string } | null>(null);
  const [editingSectionName, setEditingSectionName] = useState<string | null>(null);
  const [propSettingsPanelPos, setPropSettingsPanelPos] = useState({ x: 400, y: 200 });
  const [propSettingsPanelSize, setPropSettingsPanelSize] = useState({ width: 280, height: 520 });
  const [isPropSettingsDragging, setIsPropSettingsDragging] = useState(false);
  const [isPropSettingsResizing, setIsPropSettingsResizing] = useState(false);
  const propSettingsDragRef = useRef({ x: 0, y: 0, startX: 0, startY: 0 });
  const propSettingsResizeRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const [draggingPropertyId, setDraggingPropertyId] = useState<string | null>(null);
  const [resizingPropertyId, setResizingPropertyId] = useState<string | null>(null);
  const [dragOverrides, setDragOverrides] = useState<Record<string, { x?: number; y?: number; width?: number; height?: number }>>({});
  const propDragStartRef = useRef({ x: 0, y: 0, propX: 0, propY: 0 });
  const propResizeStartRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const layoutSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [actorValues, setActorValues] = useState<Record<string, string>>(() => {
    try {
      const d = JSON.parse(item.data || '{}');
      const values = d.values || {};
      if (item.type === 'actor' && !values.name) {
        values.name = item.name;
      }
      return values;
    } catch { return item.type === 'actor' ? { name: item.name } : {}; }
  });
  const actorSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [embeddedItems, setEmbeddedItems] = useState<Array<{
    id: string;
    templateId: string;
    name: string;
    values: Record<string, string>;
    quantity?: number;
  }>>(() => {
    try {
      const d = JSON.parse(item.data || '{}');
      return d.embeddedItems || [];
    } catch { return []; }
  });
  const [showEmbeddedItems, setShowEmbeddedItems] = useState(true);
  const [expandedEmbeddedItems, setExpandedEmbeddedItems] = useState<Set<string>>(new Set());
  const [addEmbeddedItemOpen, setAddEmbeddedItemOpen] = useState(false);

  const getExpressionContext = useCallback((): ExpressionContext => {
    const propDefs: Record<string, { type: string; defaultValue?: any }> = {};
    if (templateData) {
      for (const [key, prop] of Object.entries(templateData.properties)) {
        propDefs[key] = { type: prop.type, defaultValue: prop.defaultValue };
      }
    }
    return { values: actorValues, properties: propDefs };
  }, [actorValues, templateData]);

  const [containerAddTarget, setContainerAddTarget] = useState<{ parentId: string; tabId?: string } | null>(null);
  const [activeTabState, setActiveTabState] = useState<Record<string, string>>({});
  const [collapsedPanels, setCollapsedPanels] = useState<Record<string, boolean>>({});
  const [addNodeDialogOpen, setAddNodeDialogOpen] = useState(false);
  const [pfpEditorOpen, setPfpEditorOpen] = useState<string | null>(null);
  const [pfpEditorPos, setPfpEditorPos] = useState({ x: 200, y: 200 });
  const pfpDragRef = useRef({ startX: 0, startY: 0, posX: 0, posY: 0 });
  const [pfpDragging, setPfpDragging] = useState(false);
  const [pfpImageBrowserOpen, setPfpImageBrowserOpen] = useState(false);
  const [pfpCropImage, setPfpCropImage] = useState<string | null>(null);
  const [pfpCropArea, setPfpCropArea] = useState({ x: 0, y: 0, size: 100 });
  const pfpCropCanvasRef = useRef<HTMLCanvasElement>(null);
  const pfpCropImgRef = useRef<HTMLImageElement>(null);
  const tabImageInputRef = useRef<HTMLInputElement>(null);
  const [tabImageTarget, setTabImageTarget] = useState<{tabNodeId: string; childId: string} | null>(null);
  const pfpFileInputRef = useRef<HTMLInputElement>(null);

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

  const properties: any[] = Object.values(templateData.properties || {}).map((p: any) => ({
    ...p,
    parentId: p.parentId ?? null,
    label: p.metadata?.label || p.label || p.key,
    x: p.metadata?.uiConfig?.x ?? p.x ?? 10,
    y: p.metadata?.uiConfig?.y ?? p.y ?? 10,
    width: p.metadata?.uiConfig?.width ?? p.width ?? 200,
    height: p.metadata?.uiConfig?.height ?? p.height ?? 40,
    labelFontSize: p.metadata?.uiConfig?.labelFontSize ?? p.labelFontSize ?? 11,
    valueFontSize: p.metadata?.uiConfig?.valueFontSize ?? p.valueFontSize ?? 13,
    labelPosition: p.metadata?.uiConfig?.labelPosition ?? p.labelPosition ?? 'top',
    tooltip: p.metadata?.tooltip ?? p.tooltip,
    style: p.metadata?.style ?? p.style,
    options: p.metadata?.options ?? p.options,
    placeholder: p.metadata?.placeholder,
    min: p.metadata?.min,
    max: p.metadata?.max,
    step: p.metadata?.step,
    showBar: p.metadata?.resourceConfig?.showBar,
    barColor: p.metadata?.resourceConfig?.barColor,
    allowOverMax: p.metadata?.resourceConfig?.allowOverMax,
    colorThresholds: p.metadata?.resourceConfig?.colorThresholds,
    useGradient: p.metadata?.resourceConfig?.useGradient,
    calculationExpression: p.metadata?.calculationExpression,
    visibilityExpression: p.metadata?.visibilityExpression,
    rollFormula: p.metadata?.buttonConfig?.rollFormula,
    buttonLabel: p.metadata?.buttonConfig?.label,
    buttonColor: p.metadata?.buttonConfig?.color,
    successThreshold: p.metadata?.buttonConfig?.successThreshold,
    resourceCost: p.metadata?.buttonConfig?.resourceCost,
    maxUses: p.metadata?.buttonConfig?.maxUses,
    usesPerRest: p.metadata?.buttonConfig?.usesPerRest,
    targetingConfig: p.metadata?.buttonConfig?.targetingConfig,
  }));

  const layoutNodes: Record<string, any> = templateData.layoutNodes || {};
  const layoutNodesList = Object.values(layoutNodes).sort((a: any, b: any) => a.order - b.order);
  const sectionNodes = layoutNodesList.filter((n: any) => n.type === 'section');

  const handleAddProperty = () => {
    if (!newPropKey.trim() || !newPropLabel.trim()) return;
    if (!/^[a-zA-Z0-9]+$/.test(newPropKey)) {
      toast({ title: "Invalid key", description: "Key must be alphanumeric only", variant: "destructive" });
      return;
    }
    if (templateData.properties?.[newPropKey.trim()]) {
      toast({ title: "Duplicate key", description: "A property with this key already exists", variant: "destructive" });
      return;
    }

    const newProp = {
      id: crypto.randomUUID(),
      key: newPropKey.trim(),
      type: newPropType === 'checkbox' ? 'boolean' : newPropType === 'textarea' ? 'text' : newPropType === 'select' ? 'list' : newPropType,
      parentId: containerAddTarget?.parentId || null,
      defaultValue: newPropDefault || undefined,
      metadata: {
        label: newPropLabel.trim(),
        tooltip: newPropTooltip || undefined,
        uiConfig: {
          x: newPropX,
          y: newPropY,
          width: newPropWidth,
          height: newPropHeight,
          labelFontSize: newPropLabelFontSize,
          valueFontSize: newPropValueFontSize,
          labelPosition: newPropLabelPosition,
        },
        style: Object.keys(newPropStyle).length > 0 ? newPropStyle : undefined,
        options: undefined,
      },
    };

    const newData = {
      ...templateData,
      properties: { ...templateData.properties, [newProp.key]: newProp },
    };
    updateTemplateMutationSheet.mutate({ data: JSON.stringify(newData) });
    setAddingProperty(false);
    resetNewPropState();
    toast({ title: "Property added" });
  };

  const resetNewPropState = () => {
    setNewPropKey('');
    setNewPropLabel('');
    setNewPropType('text');
    setNewPropOptions('');
    setNewPropDefault('');
    setNewPropX(10);
    setNewPropY(10);
    setNewPropWidth(200);
    setNewPropHeight(40);
    setNewPropLabelFontSize(11);
    setNewPropValueFontSize(13);
    setNewPropLabelPosition('top');
    setNewPropTooltip('');
    setNewPropStyle({});
    setContainerAddTarget(null);
  };

  const handleButtonRoll = useCallback((prop: any) => {
    if (!prop.rollFormula) {
      toast({ title: 'No roll formula configured', variant: 'destructive' });
      return;
    }

    const targetingConfig = prop.targetingConfig || prop.metadata?.buttonConfig?.targetingConfig;
    if (targetingConfig?.type === 'aoe' && enterAoeMode && tokens) {
      const actorName = actorValues['name'] || actorValues['Name'] || item.name || 'Actor';
      const casterToken = tokens.find((t: any) =>
        t.name === actorName || t.characterId === item.id
      );

      if (!casterToken) {
        toast({ title: 'No token found on map for this actor', variant: 'destructive' });
        return;
      }

      const context: Record<string, any> = {};
      if (templateData) {
        for (const [key, p] of Object.entries(templateData.properties)) {
          let val = actorValues[key];
          if (p.metadata?.calculationExpression) {
            const calcCtx = getExpressionContext();
            const calcResult = evaluateExpression(p.metadata.calculationExpression, calcCtx);
            if (!calcResult.error) {
              val = String(calcResult.value);
            }
          }
          if (p.type === 'resource') {
            try {
              const parsed = JSON.parse(val as string || '{}');
              context[key] = parsed;
            } catch { context[key] = 0; }
          } else if (p.type === 'number') {
            context[key] = Number(val) || 0;
          } else if (p.type === 'boolean') {
            context[key] = val === 'true';
          } else {
            context[key] = val || '';
          }
        }
      }

      const syntheticSpell = {
        name: prop.buttonLabel || prop.label || prop.key,
        aoe: `${targetingConfig.aoeShape || 'circle'}:${targetingConfig.aoeRange || 20}`,
        rangeNum: targetingConfig.spellRange || 60,
      };

      enterAoeMode(syntheticSpell, casterToken.id);

      if (setPendingSandboxAoe) {
        setPendingSandboxAoe({
          rollFormula: prop.rollFormula,
          hitFormula: targetingConfig.hitFormula,
          damageFormula: targetingConfig.damageFormula,
          context,
          actorName: actorName as string,
          buttonLabel: prop.buttonLabel || prop.label || prop.key,
        });
      }
      return;
    }

    if (prop.resourceCost?.propertyKey && prop.resourceCost?.amount > 0) {
      const resKey = prop.resourceCost.propertyKey;
      const resVal = actorValues[resKey];
      try {
        const parsed = JSON.parse(resVal as string || '{"current":0,"max":0}');
        const current = Number(parsed.current) || 0;
        if (current < prop.resourceCost.amount) {
          toast({ title: `Not enough ${resKey}! Need ${prop.resourceCost.amount}, have ${current}`, variant: 'destructive' });
          return;
        }
        const newCurrent = current - prop.resourceCost.amount;
        handleActorValueChange(resKey, JSON.stringify({ current: newCurrent, max: parsed.max }));
      } catch {
        toast({ title: `Invalid resource: ${resKey}`, variant: 'destructive' });
        return;
      }
    }

    if (prop.maxUses && prop.maxUses > 0) {
      const usesKey = `__uses_${prop.key}`;
      const currentUses = Number(actorValues[usesKey] || '0');
      if (currentUses >= prop.maxUses) {
        toast({ title: `No uses remaining for ${prop.buttonLabel || prop.label || prop.key}!`, variant: 'destructive' });
        return;
      }
      handleActorValueChange(usesKey, String(currentUses + 1));
    }

    const context: Record<string, any> = {};
    if (templateData) {
      for (const [key, p] of Object.entries(templateData.properties)) {
        let val = actorValues[key];

        if (p.metadata?.calculationExpression) {
          const calcCtx = getExpressionContext();
          const calcResult = evaluateExpression(p.metadata.calculationExpression, calcCtx);
          if (!calcResult.error) {
            val = String(calcResult.value);
          }
        }

        if (p.type === 'resource') {
          try {
            const parsed = JSON.parse(val as string || '{}');
            context[key] = parsed;
          } catch { context[key] = 0; }
        } else if (p.type === 'number') {
          context[key] = Number(val) || 0;
        } else if (p.type === 'boolean') {
          context[key] = val === 'true';
        } else {
          context[key] = val || '';
        }
      }
    }

    const result = rollDice(prop.rollFormula, context);
    setLastRollResult(result);
    setRollResultVisible(true);

    if (rollResultTimeoutRef.current) clearTimeout(rollResultTimeoutRef.current);
    rollResultTimeoutRef.current = setTimeout(() => setRollResultVisible(false), 8000);

    const rollText = formatRollResult(result);
    const actorName = actorValues['name'] || actorValues['Name'] || item.name || 'Actor';
    const label = prop.buttonLabel || prop.label || prop.key;
    gameWs.sendChatMessage('', actorName as string, `🎲 ${label}: ${rollText}`, 'roll');
  }, [templateData, actorValues, item.name, toast, getExpressionContext, enterAoeMode, tokens, setPendingSandboxAoe]);

  const saveEmbeddedItems = useCallback((items: typeof embeddedItems) => {
    setEmbeddedItems(items);
    if (actorSaveTimeoutRef.current) clearTimeout(actorSaveTimeoutRef.current);
    actorSaveTimeoutRef.current = setTimeout(() => {
      updateActorMutation.mutate({
        data: JSON.stringify({ values: actorValues, embeddedItems: items })
      });
    }, 500);
  }, [actorValues, updateActorMutation]);

  const handleEmbeddedItemButtonRoll = useCallback((embItem: any, prop: any, itemTemplateData: any) => {
    if (!prop.rollFormula) {
      toast({ title: 'No roll formula configured', variant: 'destructive' });
      return;
    }

    if (prop.resourceCost?.propertyKey && prop.resourceCost?.amount > 0) {
      const resKey = prop.resourceCost.propertyKey;
      const resVal = embItem.values[resKey] || actorValues[resKey];
      try {
        const parsed = JSON.parse(resVal as string || '{"current":0,"max":0}');
        const current = Number(parsed.current) || 0;
        if (current < prop.resourceCost.amount) {
          toast({ title: `Not enough ${resKey}!`, variant: 'destructive' });
          return;
        }
        if (embItem.values[resKey]) {
          const newCurrent = current - prop.resourceCost.amount;
          const updatedItems = embeddedItems.map((ei: any) =>
            ei.id === embItem.id
              ? { ...ei, values: { ...ei.values, [resKey]: JSON.stringify({ current: newCurrent, max: parsed.max }) } }
              : ei
          );
          saveEmbeddedItems(updatedItems);
        } else {
          handleActorValueChange(resKey, JSON.stringify({ current: current - prop.resourceCost.amount, max: parsed.max }));
        }
      } catch {
        toast({ title: `Invalid resource: ${resKey}`, variant: 'destructive' });
        return;
      }
    }

    if (prop.maxUses && prop.maxUses > 0) {
      const usesKey = `__uses_${prop.key}`;
      const currentUses = Number(embItem.values[usesKey] || '0');
      if (currentUses >= prop.maxUses) {
        toast({ title: `No uses remaining!`, variant: 'destructive' });
        return;
      }
      const updatedItems = embeddedItems.map((ei: any) =>
        ei.id === embItem.id
          ? { ...ei, values: { ...ei.values, [usesKey]: String(currentUses + 1) } }
          : ei
      );
      saveEmbeddedItems(updatedItems);
    }

    const context: Record<string, any> = {};

    if (templateData) {
      for (const [key, p] of Object.entries(templateData.properties)) {
        let val = actorValues[key];
        if (p.metadata?.calculationExpression) {
          const calcCtx = getExpressionContext();
          const calcResult = evaluateExpression(p.metadata.calculationExpression, calcCtx);
          if (!calcResult.error) val = String(calcResult.value);
        }
        if (p.type === 'resource') {
          try { context[key] = JSON.parse(val as string || '{}'); } catch { context[key] = 0; }
        } else if (p.type === 'number') {
          context[key] = Number(val) || 0;
        } else {
          context[key] = val || '';
        }
      }
    }

    if (itemTemplateData) {
      for (const [key, p] of Object.entries(itemTemplateData.properties as Record<string, any>)) {
        let val = embItem.values[key];
        if (val === undefined) val = p.defaultValue;
        if (val === undefined) continue;
        if (p.type === 'resource') {
          try { context[key] = JSON.parse(val as string || '{}'); } catch { context[key] = 0; }
        } else if (p.type === 'number') {
          context[key] = Number(val) || 0;
        } else {
          context[key] = val || '';
        }
      }
    }

    const result = rollDice(prop.rollFormula, context);
    setLastRollResult(result);
    setRollResultVisible(true);
    if (rollResultTimeoutRef.current) clearTimeout(rollResultTimeoutRef.current);
    rollResultTimeoutRef.current = setTimeout(() => setRollResultVisible(false), 8000);

    const rollText = formatRollResult(result);
    const actorName = actorValues['name'] || item.name || 'Actor';
    const label = `${embItem.name}: ${prop.buttonLabel || prop.label || prop.key}`;
    gameWs.sendChatMessage('', actorName as string, `🎲 ${label}: ${rollText}`, 'roll');
  }, [templateData, actorValues, embeddedItems, item.name, toast, getExpressionContext, saveEmbeddedItems]);

  const handleRest = useCallback((restType: 'short' | 'long') => {
    if (!templateData) return;
    const allProps = Object.values(templateData.properties || {});
    let resetCount = 0;
    for (const p of allProps) {
      const usesPerRest = (p as any).metadata?.buttonConfig?.usesPerRest;
      if (!usesPerRest || usesPerRest === 'none') continue;
      if (restType === 'short' && usesPerRest === 'short') {
        handleActorValueChange(`__uses_${p.key}`, '0');
        resetCount++;
      }
      if (restType === 'long' && (usesPerRest === 'short' || usesPerRest === 'long')) {
        handleActorValueChange(`__uses_${p.key}`, '0');
        resetCount++;
      }
    }
    setShowRestMenu(false);
    toast({ title: `${restType === 'short' ? 'Short' : 'Long'} Rest completed! ${resetCount} ${resetCount === 1 ? 'ability' : 'abilities'} refreshed.` });
  }, [templateData, toast]);

  const handleNewPropTypeChange = (type: string) => {
    setNewPropType(type);
    if (type === 'resource') {
      setNewPropWidth(200);
      setNewPropHeight(50);
    } else if (type === 'textarea') {
      setNewPropWidth(300);
      setNewPropHeight(120);
    } else if (type === 'pfp') {
      setNewPropWidth(100);
      setNewPropHeight(100);
      setNewPropLabelPosition('hidden');
    } else if (type === 'label') {
      setNewPropWidth(200);
      setNewPropHeight(40);
      setNewPropLabelPosition('hidden');
    } else if (type === 'button') {
      setNewPropWidth(120);
      setNewPropHeight(36);
      setNewPropLabelPosition('hidden');
    } else if (type === 'divider') {
      setNewPropWidth(200);
      setNewPropHeight(2);
      setNewPropLabelPosition('hidden');
    } else {
      setNewPropWidth(200);
      setNewPropHeight(40);
    }
  };

  const handleAddPropertyToSection = (sectionId: string) => {
    setContainerAddTarget({ parentId: sectionId });
    resetNewPropState();
    setContainerAddTarget({ parentId: sectionId });
    const sectionProps = properties.filter((p: any) => p.parentId === sectionId);
    if (sectionProps.length > 0) {
      const maxY = Math.max(...sectionProps.map((p: any) => (p.y ?? 0) + (p.height ?? 40)));
      setNewPropX(10);
      setNewPropY(maxY + 10);
    } else {
      setNewPropX(10);
      setNewPropY(10);
    }
    setAddingProperty(true);
  };

  const handleDeleteProperty = (propId: string) => {
    const prop = properties.find((p: any) => p.id === propId);
    if (!prop) return;
    const newProps = { ...templateData.properties };
    delete newProps[prop.key];
    const newData = { ...templateData, properties: newProps };
    updateTemplateMutationSheet.mutate({ data: JSON.stringify(newData) });
    if (selectedPropertyId === propId) {
      setSelectedPropertyId(null);
      setPropSettingsOpen(false);
    }
    toast({ title: "Property deleted" });
  };

  const handleDuplicateProperty = (propId: string) => {
    const prop = properties.find((p: any) => p.id === propId);
    if (!prop) return;
    const originalProp = templateData.properties[prop.key];
    if (!originalProp) return;
    const baseKey = prop.key.replace(/Copy\d*$/, '');
    let copyKey = baseKey + 'Copy';
    let counter = 2;
    while (templateData.properties[copyKey]) {
      copyKey = baseKey + 'Copy' + counter;
      counter++;
    }
    const duplicated = {
      ...originalProp,
      id: crypto.randomUUID(),
      key: copyKey,
      metadata: {
        ...originalProp.metadata,
        label: (originalProp.metadata?.label || prop.key) + ' Copy',
        uiConfig: {
          ...originalProp.metadata?.uiConfig,
          y: (originalProp.metadata?.uiConfig?.y ?? 10) + (originalProp.metadata?.uiConfig?.height ?? 40) + 10,
        },
      },
    };
    const newData = { ...templateData, properties: { ...templateData.properties, [copyKey]: duplicated } };
    updateTemplateMutationSheet.mutate({ data: JSON.stringify(newData) });
    toast({ title: "Property duplicated" });
  };

  const handleActorValueChange = (key: string, value: string) => {
    const newValues = { ...actorValues, [key]: value };
    setActorValues(newValues);
    if (actorSaveTimeoutRef.current) clearTimeout(actorSaveTimeoutRef.current);
    actorSaveTimeoutRef.current = setTimeout(() => {
      const payload: any = { data: JSON.stringify({ values: newValues, embeddedItems }) };
      if (key === 'name') {
        payload.name = value;
      }
      updateActorMutation.mutate(payload);
    }, 500);
  };

  const toggleEmbeddedItem = (id: string) => {
    setExpandedEmbeddedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const addEmbeddedItem = (template: any) => {
    const newItem = {
      id: crypto.randomUUID(),
      templateId: template.id,
      name: template.name,
      values: {} as Record<string, string>,
      quantity: 1,
    };
    const updated = [...embeddedItems, newItem];
    saveEmbeddedItems(updated);
    setAddEmbeddedItemOpen(false);
    toast({ title: `Added ${template.name}` });
  };

  const removeEmbeddedItem = (id: string) => {
    saveEmbeddedItems(embeddedItems.filter(ei => ei.id !== id));
    toast({ title: 'Item removed' });
  };

  const saveLayoutDebounced = (updatedProps: Record<string, any>) => {
    if (layoutSaveTimeoutRef.current) clearTimeout(layoutSaveTimeoutRef.current);
    layoutSaveTimeoutRef.current = setTimeout(() => {
      const newData = { ...templateData, properties: updatedProps };
      updateTemplateMutationSheet.mutate({ data: JSON.stringify(newData) });
    }, 300);
  };

  const updatePropertyLayout = (propId: string, updates: Record<string, any>) => {
    const prop = properties.find((p: any) => p.id === propId);
    if (!prop) return;
    const original = templateData.properties[prop.key];
    if (!original) return;
    const updatedProp = {
      ...original,
      metadata: {
        ...original.metadata,
        label: updates.label !== undefined ? updates.label : original.metadata?.label,
        tooltip: updates.tooltip !== undefined ? updates.tooltip : original.metadata?.tooltip,
        uiConfig: {
          ...original.metadata?.uiConfig,
          ...(updates.x !== undefined ? { x: updates.x } : {}),
          ...(updates.y !== undefined ? { y: updates.y } : {}),
          ...(updates.width !== undefined ? { width: updates.width } : {}),
          ...(updates.height !== undefined ? { height: updates.height } : {}),
          ...(updates.labelFontSize !== undefined ? { labelFontSize: updates.labelFontSize } : {}),
          ...(updates.valueFontSize !== undefined ? { valueFontSize: updates.valueFontSize } : {}),
          ...(updates.labelPosition !== undefined ? { labelPosition: updates.labelPosition } : {}),
        },
        ...(updates.style !== undefined ? { style: updates.style } : {}),
        ...(updates.placeholder !== undefined ? { placeholder: updates.placeholder } : {}),
        ...(updates.min !== undefined ? { min: updates.min } : {}),
        ...(updates.max !== undefined ? { max: updates.max } : {}),
        ...(updates.step !== undefined ? { step: updates.step } : {}),
        ...(updates.options !== undefined ? { options: updates.options } : {}),
        ...(updates.showBar !== undefined || updates.barColor !== undefined || updates.allowOverMax !== undefined || updates.colorThresholds !== undefined || updates.useGradient !== undefined ? {
          resourceConfig: {
            ...original.metadata?.resourceConfig,
            ...(updates.showBar !== undefined ? { showBar: updates.showBar } : {}),
            ...(updates.barColor !== undefined ? { barColor: updates.barColor } : {}),
            ...(updates.allowOverMax !== undefined ? { allowOverMax: updates.allowOverMax } : {}),
            ...(updates.colorThresholds !== undefined ? { colorThresholds: updates.colorThresholds } : {}),
            ...(updates.useGradient !== undefined ? { useGradient: updates.useGradient } : {}),
          },
        } : {}),
        ...(updates.calculationExpression !== undefined ? { calculationExpression: updates.calculationExpression } : {}),
        ...(updates.visibilityExpression !== undefined ? { visibilityExpression: updates.visibilityExpression } : {}),
        ...(() => {
          const buttonUpdates: any = {};
          if (updates.rollFormula !== undefined) buttonUpdates.rollFormula = updates.rollFormula;
          if (updates.buttonLabel !== undefined) buttonUpdates.label = updates.buttonLabel;
          if (updates.buttonColor !== undefined) buttonUpdates.color = updates.buttonColor;
          if (updates.successThreshold !== undefined) buttonUpdates.successThreshold = updates.successThreshold;
          if (updates.resourceCost !== undefined) buttonUpdates.resourceCost = updates.resourceCost;
          if (updates.maxUses !== undefined) buttonUpdates.maxUses = updates.maxUses;
          if (updates.usesPerRest !== undefined) buttonUpdates.usesPerRest = updates.usesPerRest;
          if (updates.buttonConfig !== undefined) {
            return { buttonConfig: updates.buttonConfig };
          }
          if (Object.keys(buttonUpdates).length > 0) {
            return { buttonConfig: { ...(original.metadata?.buttonConfig || {}), ...buttonUpdates } };
          }
          return {};
        })(),
      },
      ...(updates.parentId !== undefined ? { parentId: updates.parentId } : {}),
      ...(updates.key !== undefined ? { key: updates.key } : {}),
      ...(updates.type !== undefined ? { type: updates.type } : {}),
      ...(updates.defaultValue !== undefined ? { defaultValue: updates.defaultValue } : {}),
    };
    const newKey = updates.key !== undefined ? updates.key : prop.key;
    const newProps = { ...templateData.properties };
    if (updates.key !== undefined && updates.key !== prop.key) {
      delete newProps[prop.key];
    }
    newProps[newKey] = updatedProp;
    saveLayoutDebounced(newProps);
  };

  const handlePropPointerDown = (e: React.PointerEvent, prop: any) => {
    if (e.button === 2) return;
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    setDraggingPropertyId(prop.id);
    setSelectedPropertyId(prop.id);
    setPropSettingsOpen(false);
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
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
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

  const handleSettingsDragDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    setIsPropSettingsDragging(true);
    propSettingsDragRef.current = { x: e.clientX, y: e.clientY, startX: propSettingsPanelPos.x, startY: propSettingsPanelPos.y };
  };

  const handleSettingsDragMove = (e: React.PointerEvent) => {
    if (!isPropSettingsDragging) return;
    const dx = e.clientX - propSettingsDragRef.current.x;
    const dy = e.clientY - propSettingsDragRef.current.y;
    setPropSettingsPanelPos({ x: propSettingsDragRef.current.startX + dx, y: propSettingsDragRef.current.startY + dy });
  };

  const handleSettingsDragUp = (e: React.PointerEvent) => {
    setIsPropSettingsDragging(false);
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };

  const handleSettingsResizeDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    setIsPropSettingsResizing(true);
    propSettingsResizeRef.current = { x: e.clientX, y: e.clientY, w: propSettingsPanelSize.width, h: propSettingsPanelSize.height };
  };

  const handleSettingsResizeMove = (e: React.PointerEvent) => {
    if (!isPropSettingsResizing) return;
    const dx = e.clientX - propSettingsResizeRef.current.x;
    const dy = e.clientY - propSettingsResizeRef.current.y;
    setPropSettingsPanelSize({
      width: Math.max(240, Math.min(500, propSettingsResizeRef.current.w + dx)),
      height: Math.max(300, Math.min(600, propSettingsResizeRef.current.h + dy)),
    });
  };

  const handleSettingsResizeUp = (e: React.PointerEvent) => {
    setIsPropSettingsResizing(false);
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };

  const renderFieldPreview = (prop: any) => {
    const labelPos = prop.labelPosition || 'top';
    const lfs = prop.labelFontSize || 11;
    const vfs = prop.valueFontSize || 13;
    const isLeft = labelPos === 'left';
    const isHidden = labelPos === 'hidden';
    const propStyle = getPropertyCssStyle(prop.style);
    const labelColor = prop.style?.labelColor || prop.style?.textColor || undefined;
    const valueColor = prop.style?.valueColor || prop.style?.textColor || undefined;

    return (
      <div className={`flex ${isLeft ? 'flex-row items-center gap-2' : 'flex-col'} w-full h-full overflow-hidden p-1`} style={propStyle}>
        {!isHidden && (
          <span className="text-purple-300 truncate shrink-0" style={{ fontSize: `${lfs}px`, ...(labelColor ? { color: labelColor } : {}) }}>
            {prop.label}
            {prop.calculationExpression && <span className="ml-1 text-amber-500 text-[8px] font-mono bg-amber-900/30 px-0.5 rounded">fx</span>}
          </span>
        )}
        <div className="flex-1 min-w-0">
          {prop.type === 'boolean' ? (
            <div className="flex items-center"><input type="checkbox" disabled className="h-4 w-4 accent-purple-600" /></div>
          ) : prop.type === 'list' ? (
            <div className="bg-stone-700/50 border border-stone-600/50 rounded px-1.5 truncate" style={{ fontSize: `${vfs}px`, color: valueColor || '#a8a29e' }}>Select ▾</div>
          ) : prop.type === 'resource' ? (
            <div className="bg-stone-700/50 border border-stone-600/50 rounded px-1.5 truncate flex items-center gap-1" style={{ fontSize: `${vfs}px`, color: valueColor || '#a8a29e' }}>
              <span>0</span><span className="text-stone-500">/</span><span>0</span>
            </div>
          ) : prop.type === 'pfp' ? (
            <div className="bg-stone-700/50 border border-stone-600/50 rounded flex items-center justify-center" style={{ fontSize: `${vfs}px` }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
          ) : prop.type === 'textarea' ? (
            <div className="bg-stone-700/50 border border-stone-600/50 rounded px-1.5 h-full" style={{ fontSize: `${vfs}px`, color: valueColor || '#a8a29e' }}>
              <span className="text-stone-500 text-[9px]">Multi-line text...</span>
            </div>
          ) : prop.type === 'button' ? (
            <div className="flex items-center justify-center h-full">
              <div 
                className="px-3 py-1 rounded text-xs font-medium text-white cursor-pointer"
                style={{ backgroundColor: prop.buttonColor || '#d97706', fontSize: `${vfs}px` }}
              >
                {prop.buttonLabel || prop.label || 'Roll'}
              </div>
            </div>
          ) : prop.type === 'divider' ? (
            <div className="flex items-center justify-center h-full w-full">
              <div className="w-full border-t border-stone-600" style={{ borderColor: prop.style?.textColor || '#57534e' }} />
            </div>
          ) : prop.type === 'label' ? (
            <div className="text-stone-400 italic truncate" style={{ fontSize: `${vfs}px` }}>
              {prop.defaultValue || 'Label text...'}
            </div>
          ) : (
            <div className="bg-stone-700/50 border border-stone-600/50 rounded px-1.5 truncate" style={{ fontSize: `${vfs}px`, color: valueColor || '#a8a29e' }}>
              {prop.type === 'number' ? '0' : 'abc'}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSheetBody = () => {
    if (item.type === 'template') {
      const renderCanvasProperty = (prop: any): React.ReactNode => {
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
            style={{ left: `${px}px`, top: `${py}px`, width: `${pw}px`, height: `${ph}px` }}
            data-testid={`canvas-property-${prop.key}`}
            title={prop.tooltip || prop.label}
            onDoubleClick={(e) => {
              e.preventDefault(); e.stopPropagation();
              setSelectedPropertyId(prop.id);
              setPropSettingsOpen(true);
              setPropContextMenu(null);
              setPropSettingsPanelPos({ x: e.clientX, y: e.clientY });
            }}
            onContextMenu={(e) => {
              e.preventDefault(); e.stopPropagation();
              setPropContextMenu({ x: e.clientX, y: e.clientY, propId: prop.id });
            }}
            onPointerDown={(e) => handlePropPointerDown(e, prop)}
            onPointerMove={(e) => handlePropPointerMove(e, prop)}
            onPointerUp={(e) => handlePropPointerUp(e, prop)}
          >
            <div
              className={`w-full h-full rounded cursor-grab active:cursor-grabbing transition-colors ${
                isSelected ? 'ring-2 ring-purple-400 shadow-lg shadow-purple-900/20' : ''
              } ${!prop.style?.backgroundColor && !prop.style?.backgroundGradient?.enabled ? (isSelected ? 'bg-purple-900/20 border border-purple-400' : 'border border-stone-600/50 bg-stone-800/60 hover:border-stone-500/70') : (isSelected ? 'border border-purple-400' : '')}`}
              style={getPropertyCssStyle(prop.style)}
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
      };

      const renderLayoutNode = (node: any): React.ReactNode => {
        const nodeStyle = node.styleConfig ? getPropertyCssStyle(node.styleConfig) : {};
        const childNodes = layoutNodesList.filter((n: any) => n.parentId === node.id).sort((a: any, b: any) => a.order - b.order);

        if (node.type === 'section') {
          const sectionProps = properties.filter((p: any) => p.parentId === node.id);
          const sectionHeight = sectionProps.length > 0
            ? Math.max(120, Math.max(...sectionProps.map((p: any) => (p.y ?? 0) + (p.height ?? 40))) + 20)
            : 120;
          
          return (
            <div
              key={node.id}
              className="relative rounded overflow-visible mb-1"
              style={{ minHeight: `${sectionHeight}px`, ...nodeStyle }}
              data-testid={`template-section-${node.name.toLowerCase()}`}
              onClick={(e) => {
                if (e.target === e.currentTarget) { setSelectedPropertyId(null); setPropSettingsOpen(false); }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSectionContextMenu({ x: e.clientX, y: e.clientY, sectionId: node.id });
              }}
            >
              <div className="absolute top-0 left-0 z-20 px-2 py-0.5">
                {editingSectionName === node.id ? (
                  <input
                    autoFocus
                    defaultValue={node.name}
                    className="bg-stone-700 border border-stone-500 text-stone-200 text-[10px] px-1 rounded w-20"
                    onBlur={(e) => {
                      const newName = e.target.value.trim() || node.name;
                      const updatedNodes = { ...layoutNodes, [node.id]: { ...node, name: newName } };
                      updateTemplateMutationSheet.mutate({ data: JSON.stringify({ ...templateData, layoutNodes: updatedNodes }) });
                      setEditingSectionName(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setEditingSectionName(null);
                    }}
                    data-testid={`input-section-name-${node.name.toLowerCase()}`}
                  />
                ) : (
                  <span className="text-[10px] text-stone-500 uppercase tracking-wider">{node.name}</span>
                )}
              </div>
              {sectionProps.map((prop: any) => renderCanvasProperty(prop))}
              {childNodes.map((child: any) => renderLayoutNode(child))}
              <button
                className="absolute w-5 h-5 rounded bg-purple-700/60 hover:bg-purple-600 text-white flex items-center justify-center transition-all opacity-60 hover:opacity-100 z-30 top-1 right-1"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddPropertyToSection(node.id);
                }}
                title={`Add property to ${node.name}`}
                data-testid={`button-add-to-section-${node.name.toLowerCase()}`}
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          );
        }

        if (node.type === 'tab') {
          const activeChildId = activeTabState[node.id] || node.behaviorConfig?.tabConfig?.activeTabId || childNodes[0]?.id;
          const activeChild = childNodes.find((c: any) => c.id === activeChildId);
          const activeChildProps = activeChild ? properties.filter((p: any) => p.parentId === activeChild.id) : [];
          const activeChildChildren = activeChild ? layoutNodesList.filter((n: any) => n.parentId === activeChild.id).sort((a: any, b: any) => a.order - b.order) : [];
          const tabContentHeight = activeChildProps.length > 0
            ? Math.max(80, Math.max(...activeChildProps.map((p: any) => (p.y ?? 0) + (p.height ?? 40))) + 20)
            : 80;
          const tabLayout = node.behaviorConfig?.tabConfig?.tabLayout || 'top';
          const tabIcons = node.behaviorConfig?.tabConfig?.tabIcons || {};
          const isVerticalTabs = tabLayout === 'left' || tabLayout === 'right';
          const tabButtonSize = node.behaviorConfig?.tabConfig?.tabButtonSize || 'medium';
          const tabSizeClass = tabButtonSize === 'small' ? 'px-2 py-0.5 text-[9px]' : tabButtonSize === 'large' ? 'px-4 py-2 text-xs' : 'px-3 py-1.5 text-[10px]';

          const handleAddTabPage = () => {
            const newChildId = crypto.randomUUID();
            const newChild: any = {
              id: newChildId,
              type: 'panel',
              name: `Tab ${childNodes.length + 1}`,
              parentId: node.id,
              childrenIds: [],
              positionConfig: { x: 0, y: 0 },
              sizeConfig: { width: canvas?.width || 450, height: 180 },
              layoutMode: 'freeform',
              styleConfig: { backgroundColor: '#1c1917' },
              order: childNodes.length,
            };
            const updatedNodes = {
              ...layoutNodes,
              [newChildId]: newChild,
              [node.id]: { ...node, childrenIds: [...(node.childrenIds || []), newChildId] },
            };
            updateTemplateMutationSheet.mutate({ data: JSON.stringify({ ...templateData, layoutNodes: updatedNodes }) });
            setActiveTabState(prev => ({ ...prev, [node.id]: newChildId }));
            toast({ title: 'Tab page added' });
          };

          const tabButtonsContent = (
            <div className={`flex ${isVerticalTabs ? 'flex-col min-w-[80px]' : 'items-center'} gap-0.5 px-1 ${!isVerticalTabs ? 'border-b border-stone-700' : 'border-r border-stone-700'}`} data-testid={`tab-buttons-${node.id}`}>
              {childNodes.map((child: any) => (
                <div key={child.id} className="relative group">
                  {editingSectionName === child.id ? (
                    <input
                      autoFocus
                      defaultValue={child.name}
                      className="bg-stone-700 border border-stone-500 text-stone-200 text-[10px] px-2 py-1 rounded w-20"
                      onBlur={(e) => {
                        const newName = e.target.value.trim() || child.name;
                        const updatedNodes = { ...layoutNodes, [child.id]: { ...child, name: newName } };
                        updateTemplateMutationSheet.mutate({ data: JSON.stringify({ ...templateData, layoutNodes: updatedNodes }) });
                        setEditingSectionName(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') setEditingSectionName(null);
                      }}
                      data-testid={`input-tab-name-${child.id}`}
                    />
                  ) : (
                    <button
                      className={`${tabSizeClass} ${isVerticalTabs ? 'rounded-l w-full text-left' : 'rounded-t'} transition-colors ${isVerticalTabs ? 'border-r-2' : 'border-b-2'} ${activeChildId === child.id ? 'bg-purple-700/30 text-purple-300 border-purple-500' : 'bg-transparent text-stone-400 hover:bg-stone-700 hover:text-stone-300 border-transparent'}`}
                      onClick={() => setActiveTabState(prev => ({ ...prev, [node.id]: child.id }))}
                      onDoubleClick={() => setEditingSectionName(child.id)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSectionContextMenu({ x: e.clientX, y: e.clientY, sectionId: child.id });
                      }}
                      data-testid={`tab-button-${child.id}`}
                    >
                      {tabIcons[child.id] ? (
                        <>
                          {tabIcons[child.id].type === 'image' ? (
                            <img src={tabIcons[child.id].value} alt={child.name} className="w-4 h-4 object-cover rounded" />
                          ) : (
                            <span>{tabIcons[child.id].value}</span>
                          )}
                          {tabIcons[child.id].showName && <span>{child.name}</span>}
                        </>
                      ) : (
                        child.name
                      )}
                    </button>
                  )}
                </div>
              ))}
              <button
                className={`px-1.5 py-1 text-[10px] text-stone-500 hover:text-stone-300 hover:bg-stone-700 rounded transition-colors ${isVerticalTabs ? '' : 'ml-0.5'}`}
                onClick={handleAddTabPage}
                title="Add tab page"
                data-testid={`button-add-tab-page-${node.id}`}
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          );

          return (
            <div key={node.id} className="relative rounded overflow-visible mb-1" style={nodeStyle}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSectionContextMenu({ x: e.clientX, y: e.clientY, sectionId: node.id });
              }}
            >
              <div className="px-2 py-0.5">
                <span className="text-[10px] text-stone-500 uppercase tracking-wider">{node.name} <span className="text-stone-600">(tab)</span></span>
              </div>
              <div className={`flex ${tabLayout === 'right' ? 'flex-row-reverse' : tabLayout === 'left' ? 'flex-row' : 'flex-col'}`}>
                {tabButtonsContent}
                {activeChild && (
                  <div
                    className="relative flex-1 rounded-b overflow-visible"
                    style={{ minHeight: `${tabContentHeight}px`, ...(activeChild.styleConfig ? getPropertyCssStyle(activeChild.styleConfig) : {}) }}
                    onClick={(e) => {
                      if (e.target === e.currentTarget) { setSelectedPropertyId(null); setPropSettingsOpen(false); }
                    }}
                  >
                    {activeChildProps.map((prop: any) => renderCanvasProperty(prop))}
                    {activeChildChildren.map((child: any) => renderLayoutNode(child))}
                  <div className="absolute top-1 right-1 flex items-center gap-1 z-30">
                    <button
                      className="w-5 h-5 rounded bg-purple-700/60 hover:bg-purple-600 text-white flex items-center justify-center transition-all opacity-60 hover:opacity-100"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddPropertyToSection(activeChild.id);
                      }}
                      title={`Add property to ${activeChild.name}`}
                      data-testid={`button-add-to-tab-${activeChild.id}`}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
            </div>
          );
        }

        if (node.type === 'stat_block') {
          const statProps = properties.filter((p: any) => p.parentId === node.id);
          return (
            <div
              key={node.id}
              className="relative rounded overflow-visible mb-1 border border-amber-900/50"
              style={{ minHeight: '80px', background: '#1a1412', ...nodeStyle }}
              data-testid={`template-stat-block-${node.name.toLowerCase()}`}
              onClick={(e) => {
                if (e.target === e.currentTarget) { setSelectedPropertyId(null); setPropSettingsOpen(false); }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSectionContextMenu({ x: e.clientX, y: e.clientY, sectionId: node.id });
              }}
            >
              <div className="absolute top-0 left-0 z-20 px-2 py-0.5 flex items-center gap-1">
                {editingSectionName === node.id ? (
                  <input
                    autoFocus
                    defaultValue={node.name}
                    className="bg-stone-700 border border-stone-500 text-stone-200 text-[10px] px-1 rounded w-20"
                    onBlur={(e) => {
                      const newName = e.target.value.trim() || node.name;
                      const updatedNodes = { ...layoutNodes, [node.id]: { ...node, name: newName } };
                      updateTemplateMutationSheet.mutate({ data: JSON.stringify({ ...templateData, layoutNodes: updatedNodes }) });
                      setEditingSectionName(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setEditingSectionName(null);
                    }}
                    data-testid={`input-section-name-${node.name.toLowerCase()}`}
                  />
                ) : (
                  <span className="text-[10px] text-amber-600 uppercase tracking-wider font-semibold">{node.name} <span className="text-stone-600">(stat block)</span></span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1 p-2 pt-5">
                {statProps.map((prop: any) => (
                  <div
                    key={prop.id}
                    className={`flex items-center justify-between px-2 py-1 bg-stone-800/50 rounded cursor-pointer border ${selectedPropertyId === prop.id ? 'border-purple-400 ring-1 ring-purple-400' : 'border-transparent hover:border-stone-600'}`}
                    onClick={(e) => { e.stopPropagation(); setSelectedPropertyId(prop.id); }}
                    onDoubleClick={(e) => {
                      e.preventDefault(); e.stopPropagation();
                      setSelectedPropertyId(prop.id);
                      setPropSettingsOpen(true);
                      setPropContextMenu(null);
                      setPropSettingsPanelPos({ x: e.clientX, y: e.clientY });
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault(); e.stopPropagation();
                      setPropContextMenu({ x: e.clientX, y: e.clientY, propId: prop.id });
                    }}
                    data-testid={`canvas-property-${prop.key}`}
                  >
                    <span className="text-stone-400 text-xs truncate">{prop.label || prop.key}</span>
                    <span className="text-stone-200 text-sm font-medium">{prop.type === 'number' ? '0' : prop.type === 'boolean' ? '☐' : 'abc'}</span>
                  </div>
                ))}
              </div>
              {childNodes.map((child: any) => renderLayoutNode(child))}
              <button
                className="absolute w-5 h-5 rounded bg-purple-700/60 hover:bg-purple-600 text-white flex items-center justify-center transition-all opacity-60 hover:opacity-100 z-30 top-1 right-1"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddPropertyToSection(node.id);
                }}
                title={`Add property to ${node.name}`}
                data-testid={`button-add-to-section-${node.name.toLowerCase()}`}
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          );
        }

        if (node.type === 'panel') {
          const isCollapsible = node.behaviorConfig?.panelConfig?.collapsible;
          const isPanelCollapsed = collapsedPanels[node.id] ?? node.behaviorConfig?.panelConfig?.defaultCollapsed ?? false;
          const panelProps = properties.filter((p: any) => p.parentId === node.id);
          const panelHeight = panelProps.length > 0
            ? Math.max(60, Math.max(...panelProps.map((p: any) => (p.y ?? 0) + (p.height ?? 40))) + 20)
            : 60;
          return (
            <div key={node.id} className="relative rounded overflow-visible mb-1" style={{ minHeight: isPanelCollapsed ? '24px' : `${panelHeight}px`, ...nodeStyle }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSectionContextMenu({ x: e.clientX, y: e.clientY, sectionId: node.id });
              }}
            >
              <div className="absolute top-0 left-0 z-20 px-2 py-0.5 flex items-center gap-1">
                {isCollapsible && (
                  <button
                    className="text-stone-500 hover:text-stone-300 transition-colors"
                    onClick={() => setCollapsedPanels(prev => ({ ...prev, [node.id]: !isPanelCollapsed }))}
                    data-testid={`button-toggle-panel-${node.id}`}
                  >
                    {isPanelCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                )}
                {editingSectionName === node.id ? (
                  <input
                    autoFocus
                    defaultValue={node.name}
                    className="bg-stone-700 border border-stone-500 text-stone-200 text-[10px] px-1 rounded w-20"
                    onBlur={(e) => {
                      const newName = e.target.value.trim() || node.name;
                      const updatedNodes = { ...layoutNodes, [node.id]: { ...node, name: newName } };
                      updateTemplateMutationSheet.mutate({ data: JSON.stringify({ ...templateData, layoutNodes: updatedNodes }) });
                      setEditingSectionName(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setEditingSectionName(null);
                    }}
                    data-testid={`input-section-name-${node.name.toLowerCase()}`}
                  />
                ) : (
                  <span className="text-[10px] text-stone-500 uppercase tracking-wider">{node.name} <span className="text-stone-600">(panel)</span></span>
                )}
              </div>
              {!isPanelCollapsed && (
                <div className="mt-4">
                  {panelProps.map((prop: any) => renderCanvasProperty(prop))}
                  {childNodes.map((child: any) => renderLayoutNode(child))}
                </div>
              )}
              <button
                className="absolute w-5 h-5 rounded bg-purple-700/60 hover:bg-purple-600 text-white flex items-center justify-center transition-all opacity-60 hover:opacity-100 z-30 top-1 right-1"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddPropertyToSection(node.id);
                }}
                title={`Add property to ${node.name}`}
                data-testid={`button-add-to-panel-${node.name.toLowerCase()}`}
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          );
        }

        return (
          <div key={node.id} className="relative overflow-visible mb-1"
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSectionContextMenu({ x: e.clientX, y: e.clientY, sectionId: node.id });
            }}
          >
            {childNodes.map((child: any) => renderLayoutNode(child))}
          </div>
        );
      };

      const canvas = templateData.canvas;
      const canvasBgStyle = canvas?.backgroundConfig ? getPropertyCssStyle(canvas.backgroundConfig as any) : {};
      const rootNodes = layoutNodesList.filter((n: any) => n.parentId === null);
      const canvasRootProps = properties.filter((p: any) => p.parentId === null);
      const canvasRootHeight = canvasRootProps.length > 0
        ? Math.max(60, Math.max(...canvasRootProps.map((p: any) => (p.y ?? 0) + (p.height ?? 40))) + 20)
        : 0;

      return (
        <div className="space-y-0" data-testid="template-properties-editor" style={canvasBgStyle}>
          {canvasRootProps.length > 0 && (
            <div
              className="relative rounded overflow-visible mb-1"
              style={{ minHeight: `${canvasRootHeight}px` }}
              onClick={(e) => {
                if (e.target === e.currentTarget) { setSelectedPropertyId(null); setPropSettingsOpen(false); }
              }}
              data-testid="canvas-root-area"
            >
              {canvasRootProps.map((prop: any) => renderCanvasProperty(prop))}
            </div>
          )}
          {rootNodes.map((node: any) => renderLayoutNode(node))}
          {rootNodes.length === 0 && canvasRootProps.length === 0 && (
            <div className="text-stone-500 text-center italic border border-dashed border-stone-700 rounded-lg p-6 text-sm">
              No layout nodes or properties defined. Add nodes or properties to build your template.
            </div>
          )}
          <div className="flex items-center gap-2 mt-2 relative">
            <button
              className="text-xs bg-stone-700 hover:bg-stone-600 text-stone-300 px-2 py-1 rounded flex items-center gap-1"
              onClick={() => setAddNodeDialogOpen(!addNodeDialogOpen)}
              data-testid="button-add-section"
            >
              <Plus className="h-3 w-3" /> Add Layout Node
            </button>
            <button
              className="text-xs bg-purple-700/60 hover:bg-purple-600 text-stone-300 px-2 py-1 rounded flex items-center gap-1"
              onClick={() => {
                setContainerAddTarget(null);
                resetNewPropState();
                const rootProps = properties.filter((p: any) => p.parentId === null);
                if (rootProps.length > 0) {
                  const maxY = Math.max(...rootProps.map((p: any) => (p.y ?? 0) + (p.height ?? 40)));
                  setNewPropX(10);
                  setNewPropY(maxY + 10);
                } else {
                  setNewPropX(10);
                  setNewPropY(10);
                }
                setAddingProperty(true);
              }}
              data-testid="button-add-canvas-root-property"
            >
              <Plus className="h-3 w-3" /> Add Property
            </button>
            {addNodeDialogOpen && (
              <div className="absolute bottom-full left-0 mb-1 bg-stone-800 border border-stone-600 rounded-lg shadow-xl py-1 min-w-[160px] z-30" data-testid="add-node-dialog">
                {(['section', 'panel', 'tab', 'group', 'stat_block'] as const).map((nodeType) => (
                  <button
                    key={nodeType}
                    className="w-full text-left px-3 py-1.5 text-xs text-stone-200 hover:bg-stone-700 capitalize"
                    onClick={() => {
                      const newNodeId = crypto.randomUUID();
                      const newNode: any = {
                        id: newNodeId,
                        type: nodeType,
                        name: `${nodeType} ${Object.keys(layoutNodes).length + 1}`,
                        parentId: null,
                        childrenIds: [],
                        positionConfig: { x: 0, y: 0 },
                        sizeConfig: { width: canvas?.width || 450, height: 200 },
                        layoutMode: 'freeform',
                        styleConfig: { backgroundColor: '#1c1917', border: { enabled: true, color: '#44403c', width: 1, radius: 4, style: 'solid' } },
                        order: Object.keys(layoutNodes).length,
                      };
                      const updatedNodes = { ...layoutNodes, [newNodeId]: newNode };
                      if (nodeType === 'tab') {
                        const childId1 = crypto.randomUUID();
                        const childId2 = crypto.randomUUID();
                        const childNode1: any = {
                          id: childId1,
                          type: 'panel',
                          name: 'Tab 1',
                          parentId: newNodeId,
                          childrenIds: [],
                          positionConfig: { x: 0, y: 0 },
                          sizeConfig: { width: canvas?.width || 450, height: 180 },
                          layoutMode: 'freeform',
                          styleConfig: { backgroundColor: '#1c1917' },
                          order: 0,
                        };
                        const childNode2: any = {
                          id: childId2,
                          type: 'panel',
                          name: 'Tab 2',
                          parentId: newNodeId,
                          childrenIds: [],
                          positionConfig: { x: 0, y: 0 },
                          sizeConfig: { width: canvas?.width || 450, height: 180 },
                          layoutMode: 'freeform',
                          styleConfig: { backgroundColor: '#1c1917' },
                          order: 1,
                        };
                        updatedNodes[childId1] = childNode1;
                        updatedNodes[childId2] = childNode2;
                        updatedNodes[newNodeId] = { ...newNode, childrenIds: [childId1, childId2], behaviorConfig: { tabConfig: { tabPosition: 'top', activeTabId: childId1 } } };
                      }
                      updateTemplateMutationSheet.mutate({ data: JSON.stringify({ ...templateData, layoutNodes: updatedNodes }) });
                      setAddNodeDialogOpen(false);
                      toast({ title: `${nodeType} added` });
                    }}
                    data-testid={`button-add-${nodeType}`}
                  >
                    {nodeType}
                  </button>
                ))}
              </div>
            )}
          </div>
          {sectionContextMenu && createPortal(
            <div className="fixed inset-0 z-[9999]" onClick={() => setSectionContextMenu(null)}>
              <div
                className="fixed bg-stone-800 border border-stone-600 rounded-lg shadow-xl py-1 min-w-[160px]"
                style={{ left: `${sectionContextMenu.x}px`, top: `${sectionContextMenu.y}px` }}
                onClick={(e) => e.stopPropagation()}
              >
                {(() => {
                  const ctxNode = layoutNodes[sectionContextMenu.sectionId];
                  if (!ctxNode) return null;
                  const isTabNode = ctxNode.type === 'tab';
                  const isPanelNode = ctxNode.type === 'panel';
                  const parentNode = ctxNode.parentId ? layoutNodes[ctxNode.parentId] : null;
                  const isTabPage = isPanelNode && parentNode?.type === 'tab';
                  const isContainer = ['panel', 'section', 'group', 'tab', 'stat_block'].includes(ctxNode.type);
                  const siblings = parentNode ? layoutNodesList.filter((n: any) => n.parentId === parentNode.id).sort((a: any, b: any) => a.order - b.order) : [];
                  const siblingIndex = siblings.findIndex((s: any) => s.id === ctxNode.id);

                  return (
                    <>
                      <button className="w-full text-left px-3 py-1.5 text-xs text-stone-200 hover:bg-stone-700" onClick={() => { setEditingSectionName(sectionContextMenu.sectionId); setSectionContextMenu(null); }} data-testid="menu-rename-section">Rename</button>
                      <button className="w-full text-left px-3 py-1.5 text-xs text-stone-200 hover:bg-stone-700" onClick={() => {
                        const modes = ['freeform', 'grid', 'stack'];
                        const currentIdx = modes.indexOf(ctxNode.layoutMode || 'freeform');
                        const nextMode = modes[(currentIdx + 1) % modes.length];
                        const updatedNodes = { ...layoutNodes, [ctxNode.id]: { ...ctxNode, layoutMode: nextMode } };
                        updateTemplateMutationSheet.mutate({ data: JSON.stringify({ ...templateData, layoutNodes: updatedNodes }) });
                        toast({ title: `Layout mode: ${nextMode}` });
                        setSectionContextMenu(null);
                      }} data-testid="menu-change-layout-mode">Change Layout Mode</button>

                      {isTabNode && (
                        <>
                          <button className="w-full text-left px-3 py-1.5 text-xs text-purple-400 hover:bg-stone-700" onClick={() => {
                            const tabChildren = layoutNodesList.filter((n: any) => n.parentId === ctxNode.id).sort((a: any, b: any) => a.order - b.order);
                            const newChildId = crypto.randomUUID();
                            const newChild: any = {
                              id: newChildId,
                              type: 'panel',
                              name: `Tab ${tabChildren.length + 1}`,
                              parentId: ctxNode.id,
                              childrenIds: [],
                              positionConfig: { x: 0, y: 0 },
                              sizeConfig: { width: canvas?.width || 450, height: 180 },
                              layoutMode: 'freeform',
                              styleConfig: { backgroundColor: '#1c1917' },
                              order: tabChildren.length,
                            };
                            const updatedNodes = {
                              ...layoutNodes,
                              [newChildId]: newChild,
                              [ctxNode.id]: { ...ctxNode, childrenIds: [...(ctxNode.childrenIds || []), newChildId] },
                            };
                            updateTemplateMutationSheet.mutate({ data: JSON.stringify({ ...templateData, layoutNodes: updatedNodes }) });
                            setActiveTabState(prev => ({ ...prev, [ctxNode.id]: newChildId }));
                            toast({ title: 'Tab page added' });
                            setSectionContextMenu(null);
                          }} data-testid="menu-add-tab-page">Add Tab Page</button>
                          <button className="w-full text-left px-3 py-1.5 text-xs text-stone-200 hover:bg-stone-700" onClick={() => {
                            const currentLayout = ctxNode.behaviorConfig?.tabConfig?.tabLayout || 'top';
                            const layouts = ['top', 'left', 'right'] as const;
                            const nextLayout = layouts[(layouts.indexOf(currentLayout as any) + 1) % layouts.length];
                            const updatedNodes = {
                              ...layoutNodes,
                              [ctxNode.id]: {
                                ...ctxNode,
                                behaviorConfig: {
                                  ...ctxNode.behaviorConfig,
                                  tabConfig: { ...ctxNode.behaviorConfig?.tabConfig, tabLayout: nextLayout },
                                },
                              },
                            };
                            updateTemplateMutationSheet.mutate({ data: JSON.stringify({ ...templateData, layoutNodes: updatedNodes }) });
                            toast({ title: `Tab layout: ${nextLayout}` });
                            setSectionContextMenu(null);
                          }} data-testid="menu-tab-layout">Tab Position ({(ctxNode.behaviorConfig?.tabConfig?.tabLayout || 'top')})</button>
                          <button className="w-full text-left px-3 py-1.5 text-xs text-stone-200 hover:bg-stone-700" onClick={() => {
                            const currentSize = ctxNode.behaviorConfig?.tabConfig?.tabButtonSize || 'medium';
                            const sizes = ['small', 'medium', 'large'] as const;
                            const nextSize = sizes[(sizes.indexOf(currentSize as any) + 1) % sizes.length];
                            const updatedNodes = {
                              ...layoutNodes,
                              [ctxNode.id]: {
                                ...ctxNode,
                                behaviorConfig: {
                                  ...ctxNode.behaviorConfig,
                                  tabConfig: { ...ctxNode.behaviorConfig?.tabConfig, tabButtonSize: nextSize },
                                },
                              },
                            };
                            updateTemplateMutationSheet.mutate({ data: JSON.stringify({ ...templateData, layoutNodes: updatedNodes }) });
                            toast({ title: `Tab button size: ${nextSize}` });
                            setSectionContextMenu(null);
                          }} data-testid="menu-tab-size">Tab Button Size ({(ctxNode.behaviorConfig?.tabConfig?.tabButtonSize || 'medium')})</button>
                        </>
                      )}

                      {isTabPage && (
                        <>
                          <button className="w-full text-left px-3 py-1.5 text-xs text-stone-200 hover:bg-stone-700" onClick={() => {
                            const currentIcon = parentNode?.behaviorConfig?.tabConfig?.tabIcons?.[ctxNode.id]?.value || '';
                            const newIcon = prompt('Enter an emoji or icon for this tab:', currentIcon);
                            if (newIcon !== null) {
                              const updatedNodes = {
                                ...layoutNodes,
                                [parentNode!.id]: {
                                  ...parentNode,
                                  behaviorConfig: {
                                    ...parentNode?.behaviorConfig,
                                    tabConfig: {
                                      ...parentNode?.behaviorConfig?.tabConfig,
                                      tabIcons: {
                                        ...parentNode?.behaviorConfig?.tabConfig?.tabIcons,
                                        [ctxNode.id]: newIcon ? { type: 'icon' as const, value: newIcon, showName: parentNode?.behaviorConfig?.tabConfig?.tabIcons?.[ctxNode.id]?.showName } : undefined,
                                      },
                                    },
                                  },
                                },
                              };
                              if (!newIcon) {
                                const icons = { ...(updatedNodes as any)[parentNode!.id].behaviorConfig.tabConfig.tabIcons };
                                delete icons[ctxNode.id];
                                (updatedNodes as any)[parentNode!.id].behaviorConfig.tabConfig.tabIcons = icons;
                              }
                              updateTemplateMutationSheet.mutate({ data: JSON.stringify({ ...templateData, layoutNodes: updatedNodes }) });
                              toast({ title: newIcon ? `Tab icon set: ${newIcon}` : 'Tab icon removed' });
                              setSectionContextMenu(null);
                            }
                          }} data-testid="menu-set-tab-icon">Set Tab Icon/Emoji</button>
                          <button className="w-full text-left px-3 py-1.5 text-xs text-stone-200 hover:bg-stone-700" onClick={() => {
                            setTabImageTarget({ tabNodeId: parentNode!.id, childId: ctxNode.id });
                            setSectionContextMenu(null);
                            setTimeout(() => tabImageInputRef.current?.click(), 100);
                          }} data-testid="menu-upload-tab-image">Upload Tab Image</button>
                          {parentNode?.behaviorConfig?.tabConfig?.tabIcons?.[ctxNode.id] && (
                            <>
                              <button className="w-full text-left px-3 py-1.5 text-xs text-stone-200 hover:bg-stone-700" onClick={() => {
                                const currentShowName = parentNode?.behaviorConfig?.tabConfig?.tabIcons?.[ctxNode.id]?.showName ?? false;
                                const updatedNodes = {
                                  ...layoutNodes,
                                  [parentNode!.id]: {
                                    ...parentNode,
                                    behaviorConfig: {
                                      ...parentNode?.behaviorConfig,
                                      tabConfig: {
                                        ...parentNode?.behaviorConfig?.tabConfig,
                                        tabIcons: {
                                          ...parentNode?.behaviorConfig?.tabConfig?.tabIcons,
                                          [ctxNode.id]: { ...parentNode?.behaviorConfig?.tabConfig?.tabIcons?.[ctxNode.id], showName: !currentShowName },
                                        },
                                      },
                                    },
                                  },
                                };
                                updateTemplateMutationSheet.mutate({ data: JSON.stringify({ ...templateData, layoutNodes: updatedNodes }) });
                                toast({ title: currentShowName ? 'Name hidden' : 'Name shown with icon' });
                                setSectionContextMenu(null);
                              }} data-testid="menu-toggle-tab-name">Toggle Name with Icon</button>
                              <button className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-stone-700" onClick={() => {
                                const updatedIcons = { ...parentNode?.behaviorConfig?.tabConfig?.tabIcons };
                                delete updatedIcons[ctxNode.id];
                                const updatedNodes = {
                                  ...layoutNodes,
                                  [parentNode!.id]: {
                                    ...parentNode,
                                    behaviorConfig: {
                                      ...parentNode?.behaviorConfig,
                                      tabConfig: {
                                        ...parentNode?.behaviorConfig?.tabConfig,
                                        tabIcons: updatedIcons,
                                      },
                                    },
                                  },
                                };
                                updateTemplateMutationSheet.mutate({ data: JSON.stringify({ ...templateData, layoutNodes: updatedNodes }) });
                                toast({ title: 'Tab icon removed' });
                                setSectionContextMenu(null);
                              }} data-testid="menu-remove-tab-icon">Remove Tab Icon</button>
                            </>
                          )}
                        </>
                      )}

                      {isPanelNode && (
                        <button className="w-full text-left px-3 py-1.5 text-xs text-stone-200 hover:bg-stone-700" onClick={() => {
                          const isCollapsible = ctxNode.behaviorConfig?.panelConfig?.collapsible ?? false;
                          const updatedNodes = {
                            ...layoutNodes,
                            [ctxNode.id]: {
                              ...ctxNode,
                              behaviorConfig: {
                                ...ctxNode.behaviorConfig,
                                panelConfig: { ...ctxNode.behaviorConfig?.panelConfig, collapsible: !isCollapsible },
                              },
                            },
                          };
                          updateTemplateMutationSheet.mutate({ data: JSON.stringify({ ...templateData, layoutNodes: updatedNodes }) });
                          toast({ title: isCollapsible ? 'Panel no longer collapsible' : 'Panel is now collapsible' });
                          setSectionContextMenu(null);
                        }} data-testid="menu-toggle-collapsible">Toggle Collapsible</button>
                      )}

                      {isTabPage && siblings.length > 1 && (
                        <>
                          {siblingIndex > 0 && (
                            <button className="w-full text-left px-3 py-1.5 text-xs text-stone-200 hover:bg-stone-700" onClick={() => {
                              const prevSibling = siblings[siblingIndex - 1];
                              const updatedNodes = {
                                ...layoutNodes,
                                [ctxNode.id]: { ...ctxNode, order: prevSibling.order },
                                [prevSibling.id]: { ...prevSibling, order: ctxNode.order },
                              };
                              updateTemplateMutationSheet.mutate({ data: JSON.stringify({ ...templateData, layoutNodes: updatedNodes }) });
                              toast({ title: 'Moved left' });
                              setSectionContextMenu(null);
                            }} data-testid="menu-move-left">Move Left</button>
                          )}
                          {siblingIndex < siblings.length - 1 && (
                            <button className="w-full text-left px-3 py-1.5 text-xs text-stone-200 hover:bg-stone-700" onClick={() => {
                              const nextSibling = siblings[siblingIndex + 1];
                              const updatedNodes = {
                                ...layoutNodes,
                                [ctxNode.id]: { ...ctxNode, order: nextSibling.order },
                                [nextSibling.id]: { ...nextSibling, order: ctxNode.order },
                              };
                              updateTemplateMutationSheet.mutate({ data: JSON.stringify({ ...templateData, layoutNodes: updatedNodes }) });
                              toast({ title: 'Moved right' });
                              setSectionContextMenu(null);
                            }} data-testid="menu-move-right">Move Right</button>
                          )}
                        </>
                      )}

                      {isContainer && (
                        <>
                          <div className="border-t border-stone-700 my-1" />
                          <div className="px-3 py-1 text-[10px] text-stone-500 uppercase tracking-wider">Add Child Node</div>
                          {(['section', 'panel', 'tab', 'group'] as const).map((childType) => (
                            <button
                              key={childType}
                              className="w-full text-left px-4 py-1.5 text-xs text-stone-300 hover:bg-stone-700 capitalize"
                              onClick={() => {
                                const newChildId = crypto.randomUUID();
                                const existingChildren = layoutNodesList.filter((n: any) => n.parentId === ctxNode.id);
                                const newChild: any = {
                                  id: newChildId,
                                  type: childType,
                                  name: `${childType} ${existingChildren.length + 1}`,
                                  parentId: ctxNode.id,
                                  childrenIds: [],
                                  positionConfig: { x: 0, y: 0 },
                                  sizeConfig: { width: canvas?.width || 450, height: childType === 'tab' ? 200 : 120 },
                                  layoutMode: 'freeform',
                                  styleConfig: { backgroundColor: '#1c1917', border: { enabled: true, color: '#44403c', width: 1, radius: 4, style: 'solid' } },
                                  order: existingChildren.length,
                                };
                                const updatedNodes = {
                                  ...layoutNodes,
                                  [newChildId]: newChild,
                                  [ctxNode.id]: { ...ctxNode, childrenIds: [...(ctxNode.childrenIds || []), newChildId] },
                                };
                                if (childType === 'tab') {
                                  const tabChild1Id = crypto.randomUUID();
                                  const tabChild2Id = crypto.randomUUID();
                                  updatedNodes[tabChild1Id] = {
                                    id: tabChild1Id, type: 'panel', name: 'Tab 1', parentId: newChildId, childrenIds: [],
                                    positionConfig: { x: 0, y: 0 }, sizeConfig: { width: canvas?.width || 450, height: 180 },
                                    layoutMode: 'freeform', styleConfig: { backgroundColor: '#1c1917' }, order: 0,
                                  };
                                  updatedNodes[tabChild2Id] = {
                                    id: tabChild2Id, type: 'panel', name: 'Tab 2', parentId: newChildId, childrenIds: [],
                                    positionConfig: { x: 0, y: 0 }, sizeConfig: { width: canvas?.width || 450, height: 180 },
                                    layoutMode: 'freeform', styleConfig: { backgroundColor: '#1c1917' }, order: 1,
                                  };
                                  updatedNodes[newChildId] = { ...updatedNodes[newChildId], childrenIds: [tabChild1Id, tabChild2Id], behaviorConfig: { tabConfig: { tabPosition: 'top', activeTabId: tabChild1Id } } };
                                }
                                updateTemplateMutationSheet.mutate({ data: JSON.stringify({ ...templateData, layoutNodes: updatedNodes }) });
                                toast({ title: `${childType} added to ${ctxNode.name}` });
                                setSectionContextMenu(null);
                              }}
                              data-testid={`menu-add-child-${childType}`}
                            >
                              {childType}
                            </button>
                          ))}
                        </>
                      )}

                      <div className="border-t border-stone-700 my-1" />
                      <button className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-stone-700" onClick={() => {
                        const nodeId = sectionContextMenu.sectionId;
                        const propsInNode = Object.values(templateData.properties || {}).filter((p: any) => p.parentId === nodeId);
                        const childNodesOfThis = layoutNodesList.filter((n: any) => n.parentId === nodeId);

                        if (isTabPage && parentNode) {
                          const tabSiblings = layoutNodesList.filter((n: any) => n.parentId === parentNode.id);
                          if (tabSiblings.length <= 1) {
                            toast({ title: "Cannot delete", description: "Tab must have at least one page", variant: "destructive" });
                            setSectionContextMenu(null);
                            return;
                          }
                          if (propsInNode.length > 0 || childNodesOfThis.length > 0) {
                            toast({ title: "Cannot delete", description: "Remove all properties and child nodes first", variant: "destructive" });
                            setSectionContextMenu(null);
                            return;
                          }
                          const updatedNodes = { ...layoutNodes };
                          delete updatedNodes[nodeId];
                          updatedNodes[parentNode.id] = {
                            ...updatedNodes[parentNode.id],
                            childrenIds: (updatedNodes[parentNode.id].childrenIds || []).filter((id: string) => id !== nodeId),
                          };
                          const remainingTabs = tabSiblings.filter((n: any) => n.id !== nodeId);
                          if (activeTabState[parentNode.id] === nodeId && remainingTabs.length > 0) {
                            setActiveTabState(prev => ({ ...prev, [parentNode.id]: remainingTabs[0].id }));
                          }
                          updateTemplateMutationSheet.mutate({ data: JSON.stringify({ ...templateData, layoutNodes: updatedNodes }) });
                          toast({ title: "Tab page deleted" });
                          setSectionContextMenu(null);
                          return;
                        }

                        if (propsInNode.length > 0) {
                          toast({ title: "Cannot delete", description: "Remove all properties first", variant: "destructive" });
                        } else if (childNodesOfThis.length > 0) {
                          toast({ title: "Cannot delete", description: "Remove all child nodes first", variant: "destructive" });
                        } else if (Object.keys(layoutNodes).length <= 1) {
                          toast({ title: "Cannot delete", description: "Template must have at least one node", variant: "destructive" });
                        } else {
                          const updatedNodes = { ...layoutNodes };
                          delete updatedNodes[nodeId];
                          if (ctxNode.parentId && updatedNodes[ctxNode.parentId]) {
                            updatedNodes[ctxNode.parentId] = {
                              ...updatedNodes[ctxNode.parentId],
                              childrenIds: (updatedNodes[ctxNode.parentId].childrenIds || []).filter((id: string) => id !== nodeId),
                            };
                          }
                          updateTemplateMutationSheet.mutate({ data: JSON.stringify({ ...templateData, layoutNodes: updatedNodes }) });
                          toast({ title: "Node deleted" });
                        }
                        setSectionContextMenu(null);
                      }} data-testid="menu-delete-section">Delete</button>
                    </>
                  );
                })()}
              </div>
            </div>,
            document.body
          )}
        </div>
      );
    }

    const linkedTemplate = templates.find((t: any) => t.id === selectedTemplateId);
    let actorProperties: any[] = [];
    let actorLayoutNodes: Record<string, any> = {};
    let actorLayoutNodesList: any[] = [];
    if (linkedTemplate) {
      try {
        const td = migrateTemplateData(JSON.parse(linkedTemplate.data || '{}'));
        actorLayoutNodes = td.layoutNodes || {};
        actorLayoutNodesList = Object.values(actorLayoutNodes).sort((a: any, b: any) => a.order - b.order);
        actorProperties = Object.values(td.properties || {}).map((p: any) => ({
          ...p,
          parentId: p.parentId ?? null,
          label: p.metadata?.label || p.key,
          x: p.metadata?.uiConfig?.x ?? 10,
          y: p.metadata?.uiConfig?.y ?? 10,
          width: p.metadata?.uiConfig?.width ?? 200,
          height: p.metadata?.uiConfig?.height ?? 40,
          labelFontSize: p.metadata?.uiConfig?.labelFontSize ?? 11,
          valueFontSize: p.metadata?.uiConfig?.valueFontSize ?? 13,
          labelPosition: p.metadata?.uiConfig?.labelPosition ?? 'top',
          tooltip: p.metadata?.tooltip,
          style: p.metadata?.style,
          options: p.metadata?.options,
          calculationExpression: p.metadata?.calculationExpression,
          visibilityExpression: p.metadata?.visibilityExpression,
          rollFormula: p.metadata?.buttonConfig?.rollFormula,
          buttonLabel: p.metadata?.buttonConfig?.label,
          buttonColor: p.metadata?.buttonConfig?.color,
          successThreshold: p.metadata?.buttonConfig?.successThreshold,
          resourceCost: p.metadata?.buttonConfig?.resourceCost,
          maxUses: p.metadata?.buttonConfig?.maxUses,
          usesPerRest: p.metadata?.buttonConfig?.usesPerRest,
          targetingConfig: p.metadata?.buttonConfig?.targetingConfig,
        }));
      } catch {}
    }

    if (actorLayoutNodesList.length === 0 && actorProperties.length === 0) {
      return (
        <div className="text-stone-500 text-center italic border border-dashed border-stone-700 rounded-lg p-8 text-sm" data-testid="actor-no-properties">
          {selectedTemplateId ? 'No properties defined in template' : 'Assign a template to see properties'}
        </div>
      );
    }

    const isActorNodeVisible = (nodeId: string): boolean => {
      const node = actorLayoutNodes[nodeId];
      if (!node) return false;
      if (node.parentId) {
        const parent = actorLayoutNodes[node.parentId];
        if (!parent) return true;
        if (parent.type === 'tab') {
          const parentChildren = Object.values(actorLayoutNodes).filter((n: any) => n.parentId === parent.id).sort((a: any, b: any) => a.order - b.order);
          const activeChildId = activeTabState[parent.id] || parent.behaviorConfig?.tabConfig?.activeTabId || parentChildren[0]?.id;
          if (node.id !== activeChildId) return false;
        }
        if (parent.type === 'panel') {
          const isPanelCollapsed = collapsedPanels[parent.id] ?? parent.behaviorConfig?.panelConfig?.defaultCollapsed ?? false;
          if (isPanelCollapsed) return false;
        }
        return isActorNodeVisible(node.parentId);
      }
      return true;
    };

    const renderActorProperty = (prop: any) => {
      if (prop.visibilityExpression && item.type === 'actor') {
        const ctx = getExpressionContext();
        const result = evaluateExpression(prop.visibilityExpression, ctx);
        if (!result.error && !result.value) {
          return null;
        }
      }

      const val = actorValues[prop.key] ?? prop.defaultValue ?? '';
      let displayVal = val;
      const hasFormula = !!(prop.calculationExpression && item.type === 'actor');
      if (hasFormula) {
        const ctx = getExpressionContext();
        const result = evaluateExpression(prop.calculationExpression, ctx);
        if (!result.error) {
          displayVal = result.value;
        }
      }
      const lfs = prop.labelFontSize ?? 11;
      const vfs = prop.valueFontSize ?? 13;
      const labelPos = prop.labelPosition || 'top';
      const isLeft = labelPos === 'left';
      const isHidden = labelPos === 'hidden';
      const propStyle = getPropertyCssStyle(prop.style);
      const { position, left, top, right, bottom, ...safePropStyle } = propStyle as any;
      const labelColor = prop.style?.labelColor || prop.style?.textColor || undefined;
      const valueColor = prop.style?.valueColor || prop.style?.textColor || undefined;

      const formulaBorder = hasFormula ? { borderColor: '#d97706', borderWidth: '1px', borderStyle: 'solid' } : {};

      if (prop.type === 'label') {
        let content = String(prop.defaultValue || val || '');
        content = content.replace(/\{\{(\w+(?:\.\w+)?)\}\}/g, (match: string, key: string) => {
          const ctx = getExpressionContext();
          const result = evaluateExpression(key, ctx);
          return result.error ? match : String(result.value);
        });

        return (
          <div
            key={prop.id}
            className="overflow-hidden"
            style={{ ...safePropStyle }}
            data-testid={`actor-property-${prop.key}`}
            title={prop.tooltip}
          >
            <div
              className="w-full"
              style={{ fontSize: `${vfs}px`, color: valueColor || '#e7e5e4' }}
              dangerouslySetInnerHTML={{ __html: content }}
            />
          </div>
        );
      }

      if (prop.type === 'button' && item.type === 'actor') {
        const usesKey = `__uses_${prop.key}`;
        const currentUses = Number(actorValues[usesKey] || '0');
        const hasUses = prop.maxUses && prop.maxUses > 0;
        const usesRemaining = hasUses ? prop.maxUses - currentUses : null;
        const isDisabled = hasUses && currentUses >= prop.maxUses;

        return (
          <div
            key={prop.id}
            className="mb-1"
            style={{ ...safePropStyle }}
            data-testid={`actor-property-${prop.key}`}
            title={prop.tooltip}
          >
            <button
              onClick={() => !isDisabled && handleButtonRoll(prop)}
              disabled={isDisabled}
              className={`w-full py-2 rounded font-medium text-white transition-all ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:brightness-110 active:scale-95 cursor-pointer'}`}
              style={{ 
                backgroundColor: prop.buttonColor || '#d97706', 
                fontSize: `${vfs}px`,
                textShadow: '0 1px 2px rgba(0,0,0,0.3)'
              }}
              data-testid={`button-roll-${prop.key}`}
            >
              {prop.buttonLabel || prop.label || 'Roll'}
              {hasUses && (
                <span className="ml-1 opacity-70 text-[10px]">({usesRemaining}/{prop.maxUses})</span>
              )}
            </button>
          </div>
        );
      }

      if (prop.type === 'divider') {
        return (
          <div
            key={prop.id}
            className="my-2 w-full"
            style={{ ...safePropStyle }}
            data-testid={`actor-property-${prop.key}`}
          >
            <div className="w-full border-t-2" style={{ borderColor: prop.style?.textColor || '#57534e' }} />
          </div>
        );
      }

      if (prop.type === 'textarea') {
        const textareaHeight = Math.max(60, prop.height ?? 80);
        return (
          <div key={prop.id} className="mb-1" style={{ ...safePropStyle }} data-testid={`actor-property-${prop.key}`} title={prop.tooltip || prop.label}>
            <div className={`flex ${isLeft ? 'flex-row items-start gap-2' : 'flex-col gap-1'} w-full`}>
              {!isHidden && <Label className="text-stone-400 truncate shrink-0" style={{ fontSize: `${lfs}px`, ...(labelColor ? { color: labelColor } : {}) }}>{prop.label}</Label>}
              <div className="flex-1 min-w-0">
                <textarea
                  value={hasFormula ? String(displayVal) : val}
                  onChange={(e) => handleActorValueChange(prop.key, e.target.value)}
                  readOnly={hasFormula}
                  className={`bg-stone-800 border border-stone-700 text-stone-200 w-full resize-none rounded px-2 py-1 ${hasFormula ? 'cursor-default opacity-80' : ''}`}
                  style={{ fontSize: `${vfs}px`, minHeight: `${textareaHeight}px`, ...(valueColor ? { color: valueColor } : {}), ...formulaBorder }}
                  data-testid={`textarea-actor-${prop.key}`}
                />
              </div>
            </div>
          </div>
        );
      }

      if (prop.type === 'pfp') {
        const pfpImage = val;
        const pfpWidth = Math.max(80, prop.width ?? 120);
        const pfpHeight = Math.max(80, prop.height ?? 120);
        return (
          <div
            key={prop.id}
            className="mb-1 flex justify-center cursor-pointer"
            style={{ ...safePropStyle }}
            data-testid={`actor-property-${prop.key}`}
            title={prop.tooltip || "Double-click to change picture"}
            onDoubleClick={() => setPfpEditorOpen(prop.key)}
          >
            <div
              className="overflow-hidden group relative rounded"
              style={{ width: `${pfpWidth}px`, height: `${pfpHeight}px` }}
            >
              {pfpImage ? (
                <img src={pfpImage as string} alt="Profile" className="w-full h-full object-cover rounded" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-stone-800 rounded">
                  <div className="flex flex-col items-center text-stone-500 gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    <span className="text-xs">Click to set</span>
                  </div>
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded">
                <span className="text-white text-xs">Change</span>
              </div>
            </div>
          </div>
        );
      }

      if (prop.type === 'resource') {
        let resourceVal: any = val;
        try { if (typeof resourceVal === 'string') resourceVal = JSON.parse(resourceVal); } catch {}
        if (typeof resourceVal !== 'object' || resourceVal === null) resourceVal = { current: 0, max: 0 };
        const current = hasFormula ? Number(displayVal) : (resourceVal.current ?? 0);
        const max = resourceVal.max ?? 0;
        const barFillPercent = max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0;
        const dynamicBarColor = getBarColor(current, max, prop);
        return (
          <div key={prop.id} className="bg-gradient-to-r from-red-900/30 to-orange-900/20 rounded-lg p-2.5 border border-red-700/30 mb-1" style={{ ...safePropStyle }} data-testid={`actor-property-${prop.key}`} title={prop.tooltip || prop.label}>
            <div className={`flex ${isLeft ? 'flex-row items-center gap-2' : 'flex-col gap-1'} w-full`}>
              {!isHidden && (
                <Label className="text-stone-400 truncate shrink-0" style={{ fontSize: `${lfs}px`, ...(labelColor ? { color: labelColor } : {}) }}>
                  {prop.label}
                  {hasFormula && <span className="ml-1 text-amber-500 text-[8px] font-mono">fx</span>}
                </Label>
              )}
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <Input type="number" value={current} onChange={(e) => { let newCurrent = Number(e.target.value); if (!prop.allowOverMax && newCurrent > max) newCurrent = max; handleActorValueChange(prop.key, JSON.stringify({ current: newCurrent, max })); }} readOnly={hasFormula} className={`bg-stone-900/60 border-stone-700 text-stone-200 h-8 flex-1 ${hasFormula ? 'cursor-default opacity-80' : ''}`} style={{ fontSize: `${vfs}px`, ...(valueColor ? { color: valueColor } : {}), ...formulaBorder }} data-testid={`input-actor-${prop.key}-current`} />
                <span className="text-stone-500 text-xs">/</span>
                <Input type="number" value={max} onChange={(e) => handleActorValueChange(prop.key, JSON.stringify({ current, max: Number(e.target.value) }))} className="bg-stone-900/60 border-stone-700 text-stone-200 h-8 flex-1" style={{ fontSize: `${vfs}px`, ...(valueColor ? { color: valueColor } : {}) }} data-testid={`input-actor-${prop.key}-max`} />
              </div>
              {prop.showBar && (
                <div className="w-full h-2 bg-stone-900/60 rounded-full overflow-hidden mt-1" data-testid={`bar-actor-${prop.key}`}>
                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${barFillPercent}%`, backgroundColor: dynamicBarColor }} />
                </div>
              )}
            </div>
          </div>
        );
      }

      if (prop.type === 'boolean') {
        return (
          <div
            key={prop.id}
            className="flex items-center justify-between bg-stone-800/40 rounded px-2 py-1.5 mb-1"
            style={{ ...safePropStyle }}
            data-testid={`actor-property-${prop.key}`}
            title={prop.tooltip || prop.label}
          >
            {!isHidden && (
              <Label className="text-stone-400 truncate shrink-0" style={{ fontSize: `${lfs}px`, ...(labelColor ? { color: labelColor } : {}) }}>
                {prop.label}
                {hasFormula && <span className="ml-1 text-amber-500 text-[8px] font-mono">fx</span>}
              </Label>
            )}
            <input
              type="checkbox"
              checked={val === true || val === 'true' || val === '1' || val === 1}
              onChange={(e) => handleActorValueChange(prop.key, e.target.checked ? 'true' : 'false')}
              className="h-4 w-4 accent-amber-600"
              data-testid={`checkbox-actor-${prop.key}`}
            />
          </div>
        );
      }

      if (prop.type === 'list') {
        return (
          <div
            key={prop.id}
            className="mb-1"
            style={{ ...safePropStyle }}
            data-testid={`actor-property-${prop.key}`}
            title={prop.tooltip || prop.label}
          >
            <div className={`flex ${isLeft ? 'flex-row items-center gap-2' : 'flex-col gap-1'}`}>
              {!isHidden && (
                <Label className="text-stone-400 truncate shrink-0" style={{ fontSize: `${lfs}px`, ...(labelColor ? { color: labelColor } : {}) }}>
                  {prop.label}
                </Label>
              )}
              <Select value={String(val) || '__empty__'} onValueChange={(v) => handleActorValueChange(prop.key, v === '__empty__' ? '' : v)}>
                <SelectTrigger className="bg-stone-800 border-stone-700 text-stone-200 h-8 w-full" style={{ fontSize: `${vfs}px`, ...(valueColor ? { color: valueColor } : {}) }} data-testid={`select-actor-${prop.key}`}>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent className="bg-stone-800 border-stone-700">
                  <SelectItem value="__empty__" className="text-stone-400">None</SelectItem>
                  {((prop.defaultValue || '').split(',').map((o: string) => o.trim()).filter(Boolean)).map((opt: string) => (
                    <SelectItem key={opt} value={opt} className="text-stone-200">{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      }

      return (
        <div
          key={prop.id}
          className="mb-1"
          style={{ ...safePropStyle }}
          data-testid={`actor-property-${prop.key}`}
          title={prop.tooltip || prop.label}
        >
          <div className={`flex ${isLeft ? 'flex-row items-center gap-2' : 'flex-col gap-1'}`}>
            {!isHidden && (
              <Label className="text-stone-400 truncate shrink-0" style={{ fontSize: `${lfs}px`, ...(labelColor ? { color: labelColor } : {}) }}>
                {prop.label}
                {hasFormula && <span className="ml-1 text-amber-500 text-[8px] font-mono">fx</span>}
              </Label>
            )}
            <div className="flex-1 min-w-0">
              {prop.type === 'text' && (
                <Input
                  value={hasFormula ? String(displayVal) : val}
                  onChange={(e) => handleActorValueChange(prop.key, e.target.value)}
                  readOnly={hasFormula}
                  className={`bg-stone-800 border-stone-700 text-stone-200 h-8 w-full ${hasFormula ? 'cursor-default opacity-80' : ''}`}
                  style={{ fontSize: `${vfs}px`, ...(valueColor ? { color: valueColor } : {}), ...formulaBorder }}
                  data-testid={`input-actor-${prop.key}`}
                />
              )}
              {prop.type === 'number' && (
                <Input
                  type="number"
                  value={hasFormula ? displayVal : val}
                  min={prop.min}
                  max={prop.max}
                  step={prop.step || 1}
                  onChange={(e) => handleActorValueChange(prop.key, e.target.value)}
                  readOnly={hasFormula}
                  className={`bg-stone-800 border-stone-700 text-stone-200 h-8 w-full ${hasFormula ? 'cursor-default opacity-80' : ''}`}
                  style={{ fontSize: `${vfs}px`, ...(valueColor ? { color: valueColor } : {}), ...formulaBorder }}
                  data-testid={`input-actor-${prop.key}`}
                />
              )}
            </div>
          </div>
        </div>
      );
    };

    const renderActorLayoutNode = (node: any): React.ReactNode => {
      if (!isActorNodeVisible(node.id)) return null;
      const rawNodeStyle = node.styleConfig ? getPropertyCssStyle(node.styleConfig) : {};
      const { position: _np, left: _nl, top: _nt, right: _nr, bottom: _nb, ...nodeStyle } = rawNodeStyle as any;
      const childNodes = actorLayoutNodesList.filter((n: any) => n.parentId === node.id).sort((a: any, b: any) => a.order - b.order);
      const nodeProps = actorProperties.filter((p: any) => p.parentId === node.id);

      const hasCompactProps = nodeProps.length > 0 && nodeProps.every((p: any) => p.type === 'number' || p.type === 'text' || p.type === 'boolean');
      const propsLayoutClass = hasCompactProps ? 'grid grid-cols-2 gap-2' : 'space-y-1';

      if (node.type === 'section') {
        return (
          <div key={node.id} className="bg-stone-800/50 border border-stone-700/60 rounded-lg p-3 mb-3 overflow-hidden" style={{ ...nodeStyle }}>
            {node.name && <div className="text-xs text-stone-500 uppercase tracking-wider mb-2 font-medium">{node.name}</div>}
            <div className={propsLayoutClass}>
              {nodeProps.map((prop: any) => renderActorProperty(prop))}
            </div>
            {childNodes.length > 0 && <div className="space-y-2 mt-2">{childNodes.map((child: any) => renderActorLayoutNode(child))}</div>}
          </div>
        );
      }

      if (node.type === 'stat_block') {
        return (
          <div key={node.id} className="rounded-lg overflow-hidden mb-3 border border-amber-900/50 bg-gradient-to-r from-cyan-900/30 to-blue-900/20" style={{ ...nodeStyle }} data-testid={`actor-stat-block-${node.id}`}>
            {node.name && <div className="px-3 py-1.5 border-b border-amber-900/30"><span className="text-[10px] text-amber-600 uppercase tracking-wider font-semibold">{node.name}</span></div>}
            <div className="grid grid-cols-2 gap-1.5 p-2.5">
              {nodeProps.map((prop: any) => {
                const val = actorValues[prop.key] ?? prop.defaultValue ?? '';
                let displayVal = val;
                const hasFormula = !!(prop.calculationExpression && item.type === 'actor');
                if (hasFormula) {
                  const ctx = getExpressionContext();
                  const result = evaluateExpression(prop.calculationExpression, ctx);
                  if (!result.error) displayVal = result.value;
                }
                if (prop.type === 'divider') {
                  return (
                    <div key={prop.id} className="col-span-2 my-1" data-testid={`actor-property-${prop.key}`}>
                      <div className="w-full border-t-2" style={{ borderColor: prop.style?.textColor || '#57534e' }} />
                    </div>
                  );
                }
                if (prop.type === 'resource') {
                  const rv = typeof displayVal === 'object' && displayVal !== null ? displayVal : { current: 0, max: 0 };
                  return (
                    <div key={prop.id} className="flex items-center justify-between px-2 py-1.5 bg-stone-800/50 rounded-md border border-stone-700/40" data-testid={`actor-property-${prop.key}`}>
                      <span className="text-stone-400 text-xs truncate">{prop.label || prop.key}</span>
                      <span className="text-stone-200 text-sm font-medium">{rv.current}/{rv.max}</span>
                    </div>
                  );
                }
                if (prop.type === 'boolean') {
                  return (
                    <div key={prop.id} className="flex items-center justify-between px-2 py-1.5 bg-stone-800/50 rounded-md border border-stone-700/40" data-testid={`actor-property-${prop.key}`}>
                      <span className="text-stone-400 text-xs truncate">{prop.label || prop.key}</span>
                      <input type="checkbox" checked={!!displayVal} onChange={(e) => handleActorValueChange(prop.key, String(e.target.checked))} className="h-3 w-3 accent-amber-600" />
                    </div>
                  );
                }
                return (
                  <div key={prop.id} className="flex items-center justify-between px-2 py-1.5 bg-stone-800/50 rounded-md border border-stone-700/40" data-testid={`actor-property-${prop.key}`}>
                    <span className="text-stone-400 text-xs truncate">{prop.label || prop.key}</span>
                    <span className="text-stone-200 text-sm font-medium">{String(displayVal)}</span>
                  </div>
                );
              })}
            </div>
            {childNodes.length > 0 && <div className="space-y-2 px-2.5 pb-2.5">{childNodes.map((child: any) => renderActorLayoutNode(child))}</div>}
          </div>
        );
      }

      if (node.type === 'tab') {
        const activeChildId = activeTabState[node.id] || node.behaviorConfig?.tabConfig?.activeTabId || childNodes[0]?.id;
        const tabLayout = node.behaviorConfig?.tabConfig?.tabLayout || 'top';
        const tabIcons = node.behaviorConfig?.tabConfig?.tabIcons || {};
        const isVerticalTabs = tabLayout === 'left' || tabLayout === 'right';
        const tabButtonSize = node.behaviorConfig?.tabConfig?.tabButtonSize || 'medium';
        const tabSizeClass = tabButtonSize === 'small' ? 'px-2 py-0.5 text-[9px]' : tabButtonSize === 'large' ? 'px-4 py-2 text-xs' : 'px-2 py-1 text-[10px]';
        return (
          <div key={node.id} className="rounded-lg overflow-visible mb-3 border border-stone-700/60 bg-stone-800/30" style={nodeStyle}>
            <div className={`flex ${tabLayout === 'right' ? 'flex-row-reverse' : tabLayout === 'left' ? 'flex-row' : 'flex-col'}`}>
              <div className={`flex ${isVerticalTabs ? 'flex-col min-w-[80px]' : 'flex-row flex-wrap'} gap-1 ${isVerticalTabs ? 'p-1' : 'p-1.5 border-b border-stone-700/40'}`} data-testid={`actor-tab-buttons-${node.id}`}>
                {childNodes.map((child: any) => (
                  <button
                    key={child.id}
                    className={`${tabSizeClass} rounded transition-colors ${isVerticalTabs ? 'text-left' : ''} ${activeChildId === child.id ? 'bg-amber-700 text-white' : 'bg-stone-700/60 text-stone-400 hover:bg-stone-600'}`}
                    onClick={() => setActiveTabState(prev => ({ ...prev, [node.id]: child.id }))}
                    data-testid={`actor-tab-button-${child.id}`}
                  >
                    {tabIcons[child.id] ? (
                      <>
                        {tabIcons[child.id].type === 'image' ? (
                          <img src={tabIcons[child.id].value} alt={child.name} className="w-4 h-4 object-cover rounded" />
                        ) : (
                          <span>{tabIcons[child.id].value}</span>
                        )}
                        {tabIcons[child.id].showName && <span>{child.name}</span>}
                      </>
                    ) : (
                      child.name
                    )}
                  </button>
                ))}
              </div>
              <div className="flex-1 p-2">
                {childNodes.filter((c: any) => c.id === activeChildId).map((child: any) => renderActorLayoutNode(child))}
              </div>
            </div>
          </div>
        );
      }

      if (node.type === 'panel') {
        const isCollapsible = node.behaviorConfig?.panelConfig?.collapsible;
        const isPanelCollapsed = collapsedPanels[node.id] ?? node.behaviorConfig?.panelConfig?.defaultCollapsed ?? false;
        return (
          <div key={node.id} className="rounded-lg overflow-visible mb-3 border border-stone-700/60 bg-stone-800/40" style={{ ...nodeStyle }}>
            {isCollapsible && (
              <div className="px-3 py-2 flex items-center gap-1.5 cursor-pointer hover:bg-stone-700/30 transition-colors rounded-t-lg"
                onClick={() => setCollapsedPanels(prev => ({ ...prev, [node.id]: !isPanelCollapsed }))}
              >
                <button
                  className="text-stone-500 hover:text-stone-300 transition-colors"
                  data-testid={`actor-toggle-panel-${node.id}`}
                >
                  {isPanelCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                <span className="text-xs text-stone-400 uppercase tracking-wider font-medium">{node.name}</span>
              </div>
            )}
            {!isPanelCollapsed && (
              <div className={`p-3 ${isCollapsible ? 'border-t border-stone-700/40' : ''}`}>
                <div className={propsLayoutClass}>
                  {nodeProps.map((prop: any) => renderActorProperty(prop))}
                </div>
                {childNodes.length > 0 && <div className="space-y-2 mt-2">{childNodes.map((child: any) => renderActorLayoutNode(child))}</div>}
              </div>
            )}
          </div>
        );
      }

      return (
        <div key={node.id} className="overflow-visible mb-2" style={nodeStyle}>
          <div className={propsLayoutClass}>
            {nodeProps.map((prop: any) => renderActorProperty(prop))}
          </div>
          {childNodes.length > 0 && <div className="space-y-2">{childNodes.map((child: any) => renderActorLayoutNode(child))}</div>}
        </div>
      );
    };

    const actorRootNodes = actorLayoutNodesList.filter((n: any) => n.parentId === null);
    const actorCanvasRootProps = actorProperties.filter((p: any) => p.parentId === null);

    return (
      <div className="space-y-3" data-testid="actor-properties-display">
        {actorCanvasRootProps.length > 0 && (
          <div className="space-y-1">
            {actorCanvasRootProps.map((prop: any) => renderActorProperty(prop))}
          </div>
        )}
        {actorRootNodes.map((node: any) => renderActorLayoutNode(node))}

        {item.type === 'actor' && (
          <div className="mt-2 border-t border-stone-700/50">
            <div
              className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-stone-800/30"
              onClick={() => setShowEmbeddedItems(!showEmbeddedItems)}
            >
              <div className="flex items-center gap-2 text-amber-400 text-xs font-medium">
                <Package className="h-3.5 w-3.5" />
                Items & Spells ({embeddedItems.length})
              </div>
              {showEmbeddedItems ? <ChevronDown className="h-3.5 w-3.5 text-stone-400" /> : <ChevronRight className="h-3.5 w-3.5 text-stone-400" />}
            </div>

            {showEmbeddedItems && (
              <div className="px-2 pb-2 space-y-1">
                {embeddedItems.map(embItem => {
                  const embTemplate = templates.find((t: any) => t.id === embItem.templateId);
                  const embTemplateData = embTemplate ? (() => { try { return migrateTemplateData(JSON.parse(embTemplate.data || '{}')); } catch { return null; } })() : null;
                  if (!embTemplateData) return null;

                  const embProps = Object.values(embTemplateData.properties || {}).map((p: any) => ({
                    ...p,
                    label: p.metadata?.label || p.key,
                    rollFormula: p.metadata?.buttonConfig?.rollFormula,
                    buttonLabel: p.metadata?.buttonConfig?.label,
                    buttonColor: p.metadata?.buttonConfig?.color,
                    resourceCost: p.metadata?.buttonConfig?.resourceCost,
                    maxUses: p.metadata?.buttonConfig?.maxUses,
                    usesPerRest: p.metadata?.buttonConfig?.usesPerRest,
                    targetingConfig: p.metadata?.buttonConfig?.targetingConfig,
                  }));

                  const buttonProps = embProps.filter((p: any) => p.type === 'button');
                  const dataProps = embProps.filter((p: any) => p.type !== 'button' && p.type !== 'divider');
                  const isExpanded = expandedEmbeddedItems.has(embItem.id);

                  return (
                    <div key={embItem.id} className="bg-stone-800/40 border border-stone-700/40 rounded-lg overflow-hidden" data-testid={`embedded-item-${embItem.id}`}>
                      <div className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-stone-800/60 cursor-pointer"
                        onClick={() => toggleEmbeddedItem(embItem.id)}>
                        {isExpanded ? <ChevronDown className="h-3 w-3 text-stone-400" /> : <ChevronRight className="h-3 w-3 text-stone-400" />}
                        <span className="text-xs text-stone-200 flex-1 font-medium">{embItem.name}</span>
                        {embItem.quantity && embItem.quantity > 1 && (
                          <span className="text-xs text-stone-400">x{embItem.quantity}</span>
                        )}
                        {buttonProps.slice(0, 2).map((bp: any) => (
                          <button key={bp.key}
                            className="px-2 py-0.5 rounded text-xs font-medium hover:brightness-110 transition-all"
                            style={{ backgroundColor: bp.buttonColor || '#d97706', color: '#fff' }}
                            onClick={(e) => { e.stopPropagation(); handleEmbeddedItemButtonRoll(embItem, bp, embTemplateData); }}
                            data-testid={`embedded-roll-${embItem.id}-${bp.key}`}
                          >
                            {bp.buttonLabel || bp.label || 'Roll'}
                          </button>
                        ))}
                        <button className="p-0.5 text-stone-500 hover:text-red-400"
                          onClick={(e) => { e.stopPropagation(); removeEmbeddedItem(embItem.id); }}
                          data-testid={`remove-embedded-${embItem.id}`}>
                          <X className="h-3 w-3" />
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="px-2.5 pb-2 space-y-1 border-t border-stone-700/30">
                          {buttonProps.length > 2 && (
                            <div className="flex flex-wrap gap-1 pt-1.5">
                              {buttonProps.slice(2).map((bp: any) => {
                                const usesKey = `__uses_${bp.key}`;
                                const currentUses = Number(embItem.values[usesKey] || '0');
                                const maxUses = bp.maxUses || 0;
                                const isDisabled = maxUses > 0 && currentUses >= maxUses;
                                return (
                                  <button key={bp.key}
                                    className={`px-2 py-1 rounded text-xs font-medium transition-all ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:brightness-110'}`}
                                    style={{ backgroundColor: bp.buttonColor || '#d97706', color: '#fff' }}
                                    disabled={isDisabled}
                                    onClick={() => handleEmbeddedItemButtonRoll(embItem, bp, embTemplateData)}
                                    data-testid={`embedded-roll-${embItem.id}-${bp.key}`}
                                  >
                                    {bp.buttonLabel || bp.label || 'Roll'}
                                    {maxUses > 0 && <span className="ml-1 opacity-70">({maxUses - currentUses}/{maxUses})</span>}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {dataProps.length > 0 && (
                            <div className="space-y-0.5 pt-1">
                              {dataProps.map((dp: any) => {
                                const val = embItem.values[dp.key] ?? dp.defaultValue ?? '';
                                return (
                                  <div key={dp.key} className="flex items-center justify-between text-xs px-1">
                                    <span className="text-stone-400">{dp.label}</span>
                                    <span className="text-stone-200">{String(val)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                <button className="w-full py-1.5 rounded-lg border border-dashed border-stone-600 text-stone-400 text-xs hover:border-amber-500/50 hover:text-amber-400 transition-colors flex items-center justify-center gap-1.5"
                  onClick={() => setAddEmbeddedItemOpen(true)}
                  data-testid="add-embedded-item-button">
                  <Plus className="h-3 w-3" /> Add Item / Spell
                </button>
              </div>
            )}

            {addEmbeddedItemOpen && (
              <div className="px-2 pb-2">
                <div className="bg-stone-900 border border-stone-600 rounded-lg p-3 space-y-2">
                  <div className="text-xs font-medium text-stone-300">Select Template</div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {templates.map((t: any) => (
                      <button key={t.id}
                        className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-stone-800 text-stone-300 hover:text-stone-100 transition-colors"
                        onClick={() => addEmbeddedItem(t)}
                        data-testid={`add-template-${t.id}`}
                      >
                        <div className="font-medium">{t.name}</div>
                      </button>
                    ))}
                  </div>
                  <button className="text-xs text-stone-500 hover:text-stone-300" onClick={() => setAddEmbeddedItemOpen(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderMobileActorBody = () => {
    const linkedTemplate = templates.find((t: any) => t.id === selectedTemplateId);
    let mobileActorProperties: any[] = [];
    let mobileLayoutNodes: Record<string, any> = {};
    let mobileLayoutNodesList: any[] = [];
    if (linkedTemplate) {
      try {
        const td = migrateTemplateData(JSON.parse(linkedTemplate.data || '{}'));
        mobileLayoutNodes = td.layoutNodes || {};
        mobileLayoutNodesList = Object.values(mobileLayoutNodes).sort((a: any, b: any) => a.order - b.order);
        mobileActorProperties = Object.values(td.properties || {}).map((p: any) => ({
          ...p,
          parentId: p.parentId ?? null,
          label: p.metadata?.label || p.key,
          x: p.metadata?.uiConfig?.x ?? 10,
          y: p.metadata?.uiConfig?.y ?? 10,
          width: p.metadata?.uiConfig?.width ?? 200,
          height: p.metadata?.uiConfig?.height ?? 40,
          labelFontSize: p.metadata?.uiConfig?.labelFontSize ?? 11,
          valueFontSize: p.metadata?.uiConfig?.valueFontSize ?? 13,
          labelPosition: p.metadata?.uiConfig?.labelPosition ?? 'top',
          tooltip: p.metadata?.tooltip,
          style: p.metadata?.style,
          options: p.metadata?.options,
          calculationExpression: p.metadata?.calculationExpression,
          visibilityExpression: p.metadata?.visibilityExpression,
          rollFormula: p.metadata?.buttonConfig?.rollFormula,
          buttonLabel: p.metadata?.buttonConfig?.label,
          buttonColor: p.metadata?.buttonConfig?.color,
          successThreshold: p.metadata?.buttonConfig?.successThreshold,
          resourceCost: p.metadata?.buttonConfig?.resourceCost,
          maxUses: p.metadata?.buttonConfig?.maxUses,
          usesPerRest: p.metadata?.buttonConfig?.usesPerRest,
          targetingConfig: p.metadata?.buttonConfig?.targetingConfig,
        }));
      } catch {}
    }

    if (mobileLayoutNodesList.length === 0 && mobileActorProperties.length === 0) {
      return (
        <div className="text-stone-500 text-center italic border border-dashed border-stone-700 rounded-lg p-8 text-sm" data-testid="actor-no-properties-mobile">
          {selectedTemplateId ? 'No properties defined in template' : 'Assign a template to see properties'}
        </div>
      );
    }

    const renderMobileProperty = (prop: any): React.ReactNode => {
      if (prop.visibilityExpression && item.type === 'actor') {
        const ctx = getExpressionContext();
        const result = evaluateExpression(prop.visibilityExpression, ctx);
        if (!result.error && !result.value) {
          return null;
        }
      }

      const val = actorValues[prop.key] ?? prop.defaultValue ?? '';
      let displayVal = val;
      const hasFormula = !!(prop.calculationExpression && item.type === 'actor');
      if (hasFormula) {
        const ctx = getExpressionContext();
        const result = evaluateExpression(prop.calculationExpression, ctx);
        if (!result.error) {
          displayVal = result.value;
        }
      }
      const lfs = prop.labelFontSize ?? 11;
      const vfs = prop.valueFontSize ?? 13;
      const propStyle = getPropertyCssStyle(prop.style);
      const labelColor = prop.style?.labelColor || prop.style?.textColor || undefined;
      const valueColor = prop.style?.valueColor || prop.style?.textColor || undefined;
      const formulaBorder = hasFormula ? { borderColor: '#d97706', borderWidth: '1px', borderStyle: 'solid' } : {};

      if (prop.type === 'button' && item.type === 'actor') {
        const usesKey = `__uses_${prop.key}`;
        const currentUses = Number(actorValues[usesKey] || '0');
        const hasUses = prop.maxUses && prop.maxUses > 0;
        const usesRemaining = hasUses ? prop.maxUses - currentUses : null;
        const isDisabled = hasUses && currentUses >= prop.maxUses;

        return (
          <div key={prop.id} className="mb-2" data-testid={`actor-property-${prop.key}`} title={prop.tooltip}>
            <button
              onClick={() => !isDisabled && handleButtonRoll(prop)}
              disabled={isDisabled}
              className={`w-full py-2 rounded font-medium text-white transition-all ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:brightness-110 active:scale-95 cursor-pointer'}`}
              style={{ 
                backgroundColor: prop.buttonColor || '#d97706', 
                fontSize: `${vfs}px`,
                textShadow: '0 1px 2px rgba(0,0,0,0.3)'
              }}
              data-testid={`button-roll-${prop.key}`}
            >
              {prop.buttonLabel || prop.label || 'Roll'}
              {hasUses && (
                <span className="ml-1 opacity-70 text-[10px]">({usesRemaining}/{prop.maxUses})</span>
              )}
            </button>
          </div>
        );
      }

      if (prop.type === 'divider') {
        return (
          <div key={prop.id} className="my-2" data-testid={`actor-property-${prop.key}`}>
            <div className="w-full border-t-2" style={{ borderColor: prop.style?.textColor || '#57534e' }} />
          </div>
        );
      }

      if (prop.type === 'label') {
        let content = String(prop.defaultValue || val || '');
        content = content.replace(/\{\{(\w+(?:\.\w+)?)\}\}/g, (match: string, key: string) => {
          const ctx = getExpressionContext();
          const result = evaluateExpression(key, ctx);
          return result.error ? match : String(result.value);
        });

        return (
          <div
            key={prop.id}
            className="overflow-hidden"
            style={{ ...propStyle }}
            data-testid={`actor-property-mobile-${prop.key}`}
            title={prop.tooltip}
          >
            <div
              className="w-full"
              style={{ fontSize: `${vfs}px`, color: valueColor || '#e7e5e4' }}
              dangerouslySetInnerHTML={{ __html: content }}
            />
          </div>
        );
      }

      if (prop.type === 'textarea') {
        return (
          <div key={prop.id} className="space-y-1" style={propStyle} data-testid={`actor-property-mobile-${prop.key}`} title={prop.tooltip || prop.label}>
            <Label className="text-stone-400" style={{ fontSize: `${lfs}px`, ...(labelColor ? { color: labelColor } : {}) }}>{prop.label}</Label>
            <textarea
              value={hasFormula ? String(displayVal) : val}
              onChange={(e) => handleActorValueChange(prop.key, e.target.value)}
              readOnly={hasFormula}
              className={`bg-stone-800 border border-stone-700 text-stone-200 w-full resize-none rounded px-2 py-1 ${hasFormula ? 'cursor-default opacity-80' : ''}`}
              style={{ fontSize: `${vfs}px`, height: `${(prop.height ?? 80) - 20}px`, ...(valueColor ? { color: valueColor } : {}), ...formulaBorder }}
              data-testid={`textarea-actor-${prop.key}`}
            />
          </div>
        );
      }

      if (prop.type === 'pfp') {
        const pfpImage = val;
        return (
          <div key={prop.id} className="space-y-1" style={propStyle} data-testid={`actor-property-mobile-${prop.key}`} title={prop.tooltip || "Tap to change picture"}>
            <Label className="text-stone-400" style={{ fontSize: `${lfs}px`, ...(labelColor ? { color: labelColor } : {}) }}>{prop.label}</Label>
            <div className="relative w-20 h-20 overflow-hidden cursor-pointer group" onClick={() => setPfpEditorOpen(prop.key)}>
              {pfpImage ? (
                <img src={pfpImage as string} alt="Profile" className="w-full h-full object-cover rounded" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-stone-800 rounded">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-stone-500"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded">
                <span className="text-white text-xs">Change</span>
              </div>
            </div>
          </div>
        );
      }

      if (prop.type === 'resource') {
        let resourceVal: any = val;
        try { if (typeof resourceVal === 'string') resourceVal = JSON.parse(resourceVal); } catch {}
        if (typeof resourceVal !== 'object' || resourceVal === null) resourceVal = { current: 0, max: 0 };
        const current = hasFormula ? Number(displayVal) : (resourceVal.current ?? 0);
        const max = resourceVal.max ?? 0;
        const barFillPercent = max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0;
        const dynamicBarColor = getBarColor(current, max, prop);
        return (
          <div key={prop.id} className="space-y-1" style={propStyle} data-testid={`actor-property-mobile-${prop.key}`} title={prop.tooltip || prop.label}>
            <Label className="text-stone-400" style={{ fontSize: `${lfs}px`, ...(labelColor ? { color: labelColor } : {}) }}>
              {prop.label}
              {hasFormula && <span className="ml-1 text-amber-500 text-[8px] font-mono">fx</span>}
            </Label>
            <div className="flex items-center gap-1">
              <Input type="number" value={current} onChange={(e) => { let newCurrent = Number(e.target.value); if (!prop.allowOverMax && newCurrent > max) newCurrent = max; handleActorValueChange(prop.key, JSON.stringify({ current: newCurrent, max })); }} readOnly={hasFormula} className={`bg-stone-800 border-stone-700 text-stone-200 h-8 flex-1 ${hasFormula ? 'cursor-default opacity-80' : ''}`} style={{ fontSize: `${vfs}px`, ...(valueColor ? { color: valueColor } : {}), ...formulaBorder }} data-testid={`input-actor-${prop.key}-current`} />
              <span className="text-stone-500 text-xs">/</span>
              <Input type="number" value={max} onChange={(e) => handleActorValueChange(prop.key, JSON.stringify({ current, max: Number(e.target.value) }))} className="bg-stone-800 border-stone-700 text-stone-200 h-8 flex-1" style={{ fontSize: `${vfs}px`, ...(valueColor ? { color: valueColor } : {}) }} data-testid={`input-actor-${prop.key}-max`} />
            </div>
            {prop.showBar && (
              <div className="w-full h-1.5 bg-stone-700 rounded-full overflow-hidden" data-testid={`bar-actor-mobile-${prop.key}`}>
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${barFillPercent}%`, backgroundColor: dynamicBarColor }} />
              </div>
            )}
          </div>
        );
      }

      return (
        <div key={prop.id} className="space-y-1" style={propStyle} data-testid={`actor-property-mobile-${prop.key}`} title={prop.tooltip || prop.label}>
          <Label className="text-stone-400" style={{ fontSize: `${lfs}px`, ...(labelColor ? { color: labelColor } : {}) }}>
            {prop.label}
            {hasFormula && <span className="ml-1 text-amber-500 text-[8px] font-mono">fx</span>}
          </Label>
          {prop.type === 'text' && (
            <Input
              value={hasFormula ? String(displayVal) : val}
              onChange={(e) => handleActorValueChange(prop.key, e.target.value)}
              readOnly={hasFormula}
              className={`bg-stone-800 border-stone-700 text-stone-200 h-8 ${hasFormula ? 'cursor-default opacity-80' : ''}`}
              style={{ fontSize: `${vfs}px`, ...(valueColor ? { color: valueColor } : {}), ...formulaBorder }}
              data-testid={`input-actor-${prop.key}`}
            />
          )}
          {prop.type === 'number' && (
            <Input
              type="number"
              value={hasFormula ? displayVal : val}
              min={prop.min}
              max={prop.max}
              step={prop.step || 1}
              onChange={(e) => handleActorValueChange(prop.key, e.target.value)}
              readOnly={hasFormula}
              className={`bg-stone-800 border-stone-700 text-stone-200 h-8 ${hasFormula ? 'cursor-default opacity-80' : ''}`}
              style={{ fontSize: `${vfs}px`, ...(valueColor ? { color: valueColor } : {}), ...formulaBorder }}
              data-testid={`input-actor-${prop.key}`}
            />
          )}
          {prop.type === 'boolean' && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={String(val) === 'true'}
                onChange={(e) => handleActorValueChange(prop.key, e.target.checked ? 'true' : 'false')}
                className="h-4 w-4 accent-amber-600"
                data-testid={`checkbox-actor-${prop.key}`}
              />
            </div>
          )}
          {prop.type === 'list' && (
            <Select value={val || '__empty__'} onValueChange={(v) => handleActorValueChange(prop.key, v === '__empty__' ? '' : v)}>
              <SelectTrigger className="bg-stone-800 border-stone-700 text-stone-200 h-8" style={{ fontSize: `${vfs}px`, ...(valueColor ? { color: valueColor } : {}) }} data-testid={`select-actor-${prop.key}`}>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent className="bg-stone-800 border-stone-700">
                <SelectItem value="__empty__" className="text-stone-400">None</SelectItem>
                {((prop.defaultValue || '').split(',').map((o: string) => o.trim()).filter(Boolean)).map((opt: string) => (
                  <SelectItem key={opt} value={opt} className="text-stone-200">{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      );
    };

    const isMobileNodeVisible = (nodeId: string): boolean => {
      const node = mobileLayoutNodes[nodeId];
      if (!node) return false;
      if (node.parentId) {
        const parent = mobileLayoutNodes[node.parentId];
        if (!parent) return true;
        if (parent.type === 'tab') {
          const parentChildren = mobileLayoutNodesList.filter((n: any) => n.parentId === parent.id).sort((a: any, b: any) => a.order - b.order);
          const activeChildId = activeTabState[parent.id] || parent.behaviorConfig?.tabConfig?.activeTabId || parentChildren[0]?.id;
          if (node.id !== activeChildId) return false;
        }
        if (parent.type === 'panel') {
          const isPanelCollapsed = collapsedPanels[parent.id] ?? parent.behaviorConfig?.panelConfig?.defaultCollapsed ?? false;
          if (isPanelCollapsed) return false;
        }
        return isMobileNodeVisible(node.parentId);
      }
      return true;
    };

    const renderMobileLayoutNode = (node: any): React.ReactNode => {
      if (!isMobileNodeVisible(node.id)) return null;
      const nodeStyle = node.styleConfig ? getPropertyCssStyle(node.styleConfig) : {};
      const childNodes = mobileLayoutNodesList.filter((n: any) => n.parentId === node.id).sort((a: any, b: any) => a.order - b.order);
      const nodeProps = mobileActorProperties.filter((p: any) => p.parentId === node.id);

      if (node.type === 'section') {
        return (
          <div key={node.id} className="space-y-3" style={nodeStyle}>
            {nodeProps.map((prop: any) => renderMobileProperty(prop))}
            {childNodes.map((child: any) => renderMobileLayoutNode(child))}
          </div>
        );
      }

      if (node.type === 'stat_block') {
        return (
          <div key={node.id} className="rounded overflow-hidden mb-2 border border-amber-900/50" style={{ background: '#1a1412', ...nodeStyle }} data-testid={`mobile-stat-block-${node.id}`}>
            {node.name && <div className="px-3 py-1.5 border-b border-amber-900/30"><span className="text-xs text-amber-600 uppercase tracking-wider font-semibold">{node.name}</span></div>}
            <div className="grid grid-cols-1 gap-1 p-2">
              {nodeProps.map((prop: any) => {
                const val = actorValues[prop.key] ?? prop.defaultValue ?? '';
                let displayVal = val;
                const hasFormula = !!(prop.calculationExpression && item.type === 'actor');
                if (hasFormula) {
                  const ctx = getExpressionContext();
                  const result = evaluateExpression(prop.calculationExpression, ctx);
                  if (!result.error) displayVal = result.value;
                }
                if (prop.type === 'divider') {
                  return (
                    <div key={prop.id} className="my-1" data-testid={`actor-property-${prop.key}`}>
                      <div className="w-full border-t-2" style={{ borderColor: prop.style?.textColor || '#57534e' }} />
                    </div>
                  );
                }
                if (prop.type === 'resource') {
                  const rv = typeof displayVal === 'object' && displayVal !== null ? displayVal : { current: 0, max: 0 };
                  return (
                    <div key={prop.id} className="flex items-center justify-between px-2 py-1 bg-stone-800/50 rounded" data-testid={`actor-property-${prop.key}`}>
                      <span className="text-stone-400 text-xs truncate">{prop.label || prop.key}</span>
                      <span className="text-stone-200 text-sm font-medium">{rv.current}/{rv.max}</span>
                    </div>
                  );
                }
                if (prop.type === 'boolean') {
                  return (
                    <div key={prop.id} className="flex items-center justify-between px-2 py-1 bg-stone-800/50 rounded" data-testid={`actor-property-${prop.key}`}>
                      <span className="text-stone-400 text-xs truncate">{prop.label || prop.key}</span>
                      <input type="checkbox" checked={!!displayVal} onChange={(e) => handleActorValueChange(prop.key, String(e.target.checked))} className="h-3 w-3 accent-amber-600" />
                    </div>
                  );
                }
                return (
                  <div key={prop.id} className="flex items-center justify-between px-2 py-1 bg-stone-800/50 rounded" data-testid={`actor-property-${prop.key}`}>
                    <span className="text-stone-400 text-xs truncate">{prop.label || prop.key}</span>
                    <span className="text-stone-200 text-sm font-medium">{String(displayVal)}</span>
                  </div>
                );
              })}
            </div>
            {childNodes.map((child: any) => renderMobileLayoutNode(child))}
          </div>
        );
      }

      if (node.type === 'tab') {
        const activeChildId = activeTabState[node.id] || node.behaviorConfig?.tabConfig?.activeTabId || childNodes[0]?.id;
        const tabLayout = node.behaviorConfig?.tabConfig?.tabLayout || 'top';
        const tabIcons = node.behaviorConfig?.tabConfig?.tabIcons || {};
        const isVerticalTabs = tabLayout === 'left' || tabLayout === 'right';
        const tabButtonSize = node.behaviorConfig?.tabConfig?.tabButtonSize || 'medium';
        const tabSizeClass = tabButtonSize === 'small' ? 'px-2 py-0.5 text-[9px]' : tabButtonSize === 'large' ? 'px-4 py-2 text-xs' : 'px-3 py-1.5 text-xs';
        return (
          <div key={node.id} className="space-y-2" style={nodeStyle}>
            <div className={`flex ${tabLayout === 'right' ? 'flex-row-reverse' : tabLayout === 'left' ? 'flex-row' : 'flex-col'} gap-2`}>
              <div className={`flex ${isVerticalTabs ? 'flex-col min-w-[80px]' : 'flex-row flex-wrap'} gap-1`} data-testid={`mobile-tab-buttons-${node.id}`}>
                {childNodes.map((child: any) => (
                  <button
                    key={child.id}
                    className={`${tabSizeClass} rounded transition-colors ${isVerticalTabs ? 'text-left' : ''} ${activeChildId === child.id ? 'bg-amber-700 text-white' : 'bg-stone-700 text-stone-400 hover:bg-stone-600'}`}
                    onClick={() => setActiveTabState(prev => ({ ...prev, [node.id]: child.id }))}
                    data-testid={`mobile-tab-button-${child.id}`}
                  >
                    {tabIcons[child.id] ? (
                      <>
                        {tabIcons[child.id].type === 'image' ? (
                          <img src={tabIcons[child.id].value} alt={child.name} className="w-4 h-4 object-cover rounded" />
                        ) : (
                          <span>{tabIcons[child.id].value}</span>
                        )}
                        {tabIcons[child.id].showName && <span>{child.name}</span>}
                      </>
                    ) : (
                      child.name
                    )}
                  </button>
                ))}
              </div>
              <div className="flex-1">
                {childNodes.filter((c: any) => c.id === activeChildId).map((child: any) => renderMobileLayoutNode(child))}
              </div>
            </div>
          </div>
        );
      }

      if (node.type === 'panel') {
        const isCollapsible = node.behaviorConfig?.panelConfig?.collapsible;
        const isPanelCollapsed = collapsedPanels[node.id] ?? node.behaviorConfig?.panelConfig?.defaultCollapsed ?? false;
        return (
          <div key={node.id} className="space-y-2" style={nodeStyle}>
            {isCollapsible && (
              <button
                className="flex items-center gap-1 text-stone-400 hover:text-stone-200 transition-colors"
                onClick={() => setCollapsedPanels(prev => ({ ...prev, [node.id]: !isPanelCollapsed }))}
                data-testid={`mobile-toggle-panel-${node.id}`}
              >
                {isPanelCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                <span className="text-xs uppercase tracking-wider">{node.name}</span>
              </button>
            )}
            {!isPanelCollapsed && (
              <div className="space-y-3">
                {nodeProps.map((prop: any) => renderMobileProperty(prop))}
                {childNodes.map((child: any) => renderMobileLayoutNode(child))}
              </div>
            )}
          </div>
        );
      }

      return (
        <div key={node.id} className="space-y-3" style={nodeStyle}>
          {nodeProps.map((prop: any) => renderMobileProperty(prop))}
          {childNodes.map((child: any) => renderMobileLayoutNode(child))}
        </div>
      );
    };

    const mobileRootNodes = mobileLayoutNodesList.filter((n: any) => n.parentId === null);
    const mobileCanvasRootProps = mobileActorProperties.filter((p: any) => p.parentId === null);

    return (
      <div className="space-y-3" data-testid="actor-properties-display-mobile">
        {mobileCanvasRootProps.map((prop: any) => renderMobileProperty(prop))}
        {mobileRootNodes.map((node: any) => renderMobileLayoutNode(node))}

        {item.type === 'actor' && (
          <div className="mt-3 border-t border-stone-700/50 pt-2">
            <div
              className="flex items-center justify-between px-2 py-2 cursor-pointer"
              onClick={() => setShowEmbeddedItems(!showEmbeddedItems)}
            >
              <div className="flex items-center gap-2 text-amber-400 text-sm font-medium">
                <Package className="h-4 w-4" />
                Items & Spells ({embeddedItems.length})
              </div>
              {showEmbeddedItems ? <ChevronDown className="h-4 w-4 text-stone-400" /> : <ChevronRight className="h-4 w-4 text-stone-400" />}
            </div>

            {showEmbeddedItems && (
              <div className="space-y-2 px-1">
                {embeddedItems.map(embItem => {
                  const embTemplate = templates.find((t: any) => t.id === embItem.templateId);
                  const embTemplateData = embTemplate ? (() => { try { return migrateTemplateData(JSON.parse(embTemplate.data || '{}')); } catch { return null; } })() : null;
                  if (!embTemplateData) return null;

                  const embProps = Object.values(embTemplateData.properties || {}).map((p: any) => ({
                    ...p,
                    label: p.metadata?.label || p.key,
                    rollFormula: p.metadata?.buttonConfig?.rollFormula,
                    buttonLabel: p.metadata?.buttonConfig?.label,
                    buttonColor: p.metadata?.buttonConfig?.color,
                    resourceCost: p.metadata?.buttonConfig?.resourceCost,
                    maxUses: p.metadata?.buttonConfig?.maxUses,
                    usesPerRest: p.metadata?.buttonConfig?.usesPerRest,
                    targetingConfig: p.metadata?.buttonConfig?.targetingConfig,
                  }));

                  const buttonProps = embProps.filter((p: any) => p.type === 'button');
                  const dataProps = embProps.filter((p: any) => p.type !== 'button' && p.type !== 'divider');
                  const isExpanded = expandedEmbeddedItems.has(embItem.id);

                  return (
                    <div key={embItem.id} className="bg-stone-800/40 border border-stone-700/40 rounded-lg overflow-hidden" data-testid={`mobile-embedded-item-${embItem.id}`}>
                      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                        onClick={() => toggleEmbeddedItem(embItem.id)}>
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-stone-400" /> : <ChevronRight className="h-4 w-4 text-stone-400" />}
                        <span className="text-sm text-stone-200 flex-1 font-medium">{embItem.name}</span>
                        {embItem.quantity && embItem.quantity > 1 && (
                          <span className="text-xs text-stone-400">x{embItem.quantity}</span>
                        )}
                        <button className="p-1 text-stone-500 hover:text-red-400"
                          onClick={(e) => { e.stopPropagation(); removeEmbeddedItem(embItem.id); }}
                          data-testid={`mobile-remove-embedded-${embItem.id}`}>
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="px-3 pb-3 space-y-2 border-t border-stone-700/30">
                          {buttonProps.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-2">
                              {buttonProps.map((bp: any) => {
                                const usesKey = `__uses_${bp.key}`;
                                const currentUses = Number(embItem.values[usesKey] || '0');
                                const maxUses = bp.maxUses || 0;
                                const isDisabled = maxUses > 0 && currentUses >= maxUses;
                                return (
                                  <button key={bp.key}
                                    className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:brightness-110'}`}
                                    style={{ backgroundColor: bp.buttonColor || '#d97706', color: '#fff' }}
                                    disabled={isDisabled}
                                    onClick={() => handleEmbeddedItemButtonRoll(embItem, bp, embTemplateData)}
                                    data-testid={`mobile-embedded-roll-${embItem.id}-${bp.key}`}
                                  >
                                    {bp.buttonLabel || bp.label || 'Roll'}
                                    {maxUses > 0 && <span className="ml-1 opacity-70">({maxUses - currentUses}/{maxUses})</span>}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {dataProps.length > 0 && (
                            <div className="space-y-1 pt-1">
                              {dataProps.map((dp: any) => {
                                const val = embItem.values[dp.key] ?? dp.defaultValue ?? '';
                                return (
                                  <div key={dp.key} className="flex items-center justify-between text-sm px-1">
                                    <span className="text-stone-400">{dp.label}</span>
                                    <span className="text-stone-200">{String(val)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                <button className="w-full py-2 rounded-lg border border-dashed border-stone-600 text-stone-400 text-sm hover:border-amber-500/50 hover:text-amber-400 transition-colors flex items-center justify-center gap-2"
                  onClick={() => setAddEmbeddedItemOpen(true)}
                  data-testid="mobile-add-embedded-item-button">
                  <Plus className="h-4 w-4" /> Add Item / Spell
                </button>
              </div>
            )}

            {addEmbeddedItemOpen && (
              <div className="px-1 pb-2 mt-2">
                <div className="bg-stone-900 border border-stone-600 rounded-lg p-3 space-y-2">
                  <div className="text-sm font-medium text-stone-300">Select Template</div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {templates.map((t: any) => (
                      <button key={t.id}
                        className="w-full text-left px-3 py-2 rounded text-sm hover:bg-stone-800 text-stone-300 hover:text-stone-100 transition-colors"
                        onClick={() => addEmbeddedItem(t)}
                        data-testid={`mobile-add-template-${t.id}`}
                      >
                        <div className="font-medium">{t.name}</div>
                      </button>
                    ))}
                  </div>
                  <button className="text-sm text-stone-500 hover:text-stone-300" onClick={() => setAddEmbeddedItemOpen(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
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
              {item.type === 'actor' ? 'Actor' : 'Template'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {item.type === 'actor' && (
              <div className="relative">
                <Button variant="ghost" size="icon" onClick={() => setShowRestMenu(!showRestMenu)} className={`text-stone-400 hover:text-white ${showRestMenu ? 'text-amber-400' : ''}`} data-testid="button-rest-menu-mobile">
                  <Coffee className="h-5 w-5" />
                </Button>
                {showRestMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-stone-800 border border-stone-600 rounded-lg shadow-xl z-50 py-1 min-w-[120px]">
                    <button
                      onClick={() => handleRest('short')}
                      className="w-full text-left px-3 py-2 text-sm text-stone-200 hover:bg-stone-700 transition-colors"
                      data-testid="button-short-rest-mobile"
                    >
                      Short Rest
                    </button>
                    <button
                      onClick={() => handleRest('long')}
                      className="w-full text-left px-3 py-2 text-sm text-stone-200 hover:bg-stone-700 transition-colors"
                      data-testid="button-long-rest-mobile"
                    >
                      Long Rest
                    </button>
                  </div>
                )}
              </div>
            )}
            {item.type === 'actor' && role === 'gm' && (
              <Button variant="ghost" size="icon" onClick={() => setShowActorSettings(!showActorSettings)} className={`text-stone-400 hover:text-white ${showActorSettings ? 'text-amber-400' : ''}`} data-testid="button-actor-settings-mobile">
                <Settings className="h-5 w-5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => setCollapsed(!collapsed)} className="text-stone-400 hover:text-white" data-testid="button-collapse-sheet-mobile">
              {collapsed ? <ChevronRight className="h-5 w-5 rotate-90" /> : <Minus className="h-5 w-5" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} className="text-stone-400 hover:text-white" data-testid="button-close-sheet-mobile">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
        {!collapsed && showActorSettings && item.type === 'actor' && role === 'gm' && (
          <div className="px-4 py-3 border-b border-amber-800/30 bg-amber-900/10 space-y-2">
            <Label className="text-stone-400 text-sm">Template</Label>
            <Select value={selectedTemplateId || '__none__'} onValueChange={(v) => handleTemplateChange(v === '__none__' ? '' : v)}>
              <SelectTrigger className="bg-stone-800 border-stone-700 text-stone-200">
                <SelectValue placeholder="Select a template..." />
              </SelectTrigger>
              <SelectContent className="bg-stone-800 border-stone-700 z-[10000]">
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
        {!collapsed && <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
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
      className="fixed pointer-events-auto"
      style={{ left: `${position.x}px`, top: `${position.y}px`, width: `${size.width}px`, height: collapsed ? 'auto' : `${size.height}px`, zIndex }}
      onMouseDown={onBringToFront}
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
              {item.type === 'actor' ? (actorValues.name || item.name) : item.name}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${item.type === 'actor' ? 'text-amber-500/60 bg-amber-900/20' : 'text-purple-400/60 bg-purple-900/20'}`}>
              {item.type === 'actor' ? 'Actor' : 'Template'}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {item.type === 'actor' && (
              <div className="relative">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setShowRestMenu(!showRestMenu)} 
                  className={`h-6 w-6 text-stone-400 hover:text-white ${showRestMenu ? 'text-amber-400' : ''}`}
                  data-testid="button-rest-menu"
                >
                  <Coffee className="h-3.5 w-3.5" />
                </Button>
                {showRestMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-stone-800 border border-stone-600 rounded-lg shadow-xl z-50 py-1 min-w-[120px]">
                    <button
                      onClick={() => handleRest('short')}
                      className="w-full text-left px-3 py-1.5 text-xs text-stone-200 hover:bg-stone-700 transition-colors"
                      data-testid="button-short-rest"
                    >
                      Short Rest
                    </button>
                    <button
                      onClick={() => handleRest('long')}
                      className="w-full text-left px-3 py-1.5 text-xs text-stone-200 hover:bg-stone-700 transition-colors"
                      data-testid="button-long-rest"
                    >
                      Long Rest
                    </button>
                  </div>
                )}
              </div>
            )}
            {item.type === 'actor' && role === 'gm' && (
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setShowActorSettings(!showActorSettings)} 
                className={`h-6 w-6 text-stone-400 hover:text-white ${showActorSettings ? 'text-amber-400' : ''}`}
                data-testid="button-actor-settings"
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            )}
            {item.type === 'template' && role === 'gm' && (
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setShowTemplateSettings(!showTemplateSettings)} 
                className={`h-6 w-6 text-stone-400 hover:text-white ${showTemplateSettings ? 'text-purple-400' : ''}`}
                data-testid="button-template-settings"
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            )}
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

        {!collapsed && showActorSettings && item.type === 'actor' && role === 'gm' && (
          <div className="px-4 py-3 border-b border-amber-800/30 bg-amber-900/10 space-y-2">
            <Label className="text-stone-400 text-sm">Template</Label>
            <Select value={selectedTemplateId || '__none__'} onValueChange={(v) => handleTemplateChange(v === '__none__' ? '' : v)}>
              <SelectTrigger className="bg-stone-800 border-stone-700 text-stone-200 h-9">
                <SelectValue placeholder="Select a template..." />
              </SelectTrigger>
              <SelectContent className="bg-stone-800 border-stone-700 z-[10000]">
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

        {!collapsed && showTemplateSettings && item.type === 'template' && role === 'gm' && (() => {
          const currentSettings = settings;
          const saveTemplateSettings = (newSettings: any) => {
            const currentData = { ...templateData, settings: newSettings, properties: templateData.properties || {} };
            updateTemplateMutationSheet.mutate({ data: JSON.stringify(currentData) });
            toast({ title: "Template settings saved" });
          };
          return (
            <div className="px-4 py-3 border-b border-purple-800/30 bg-purple-900/10 space-y-2" data-testid="template-settings-panel">
              <div className="space-y-1.5">
                <Label className="text-stone-400 text-xs">Default Width (280-900)</Label>
                <Input
                  type="number"
                  min={280}
                  max={900}
                  defaultValue={currentSettings.defaultWidth || 450}
                  onBlur={(e) => {
                    const v = Math.min(900, Math.max(280, parseInt(e.target.value) || 400));
                    saveTemplateSettings({ ...currentSettings, defaultWidth: v, defaultHeight: currentSettings.defaultHeight || 550, allowResize: currentSettings.allowResize !== false });
                  }}
                  className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs"
                  data-testid="input-template-default-width"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-stone-400 text-xs">Default Height (200-800)</Label>
                <Input
                  type="number"
                  min={200}
                  max={800}
                  defaultValue={currentSettings.defaultHeight || 550}
                  onBlur={(e) => {
                    const v = Math.min(800, Math.max(200, parseInt(e.target.value) || 450));
                    saveTemplateSettings({ ...currentSettings, defaultWidth: currentSettings.defaultWidth || 450, defaultHeight: v, allowResize: currentSettings.allowResize !== false });
                  }}
                  className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs"
                  data-testid="input-template-default-height"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  defaultChecked={currentSettings.allowResize !== false}
                  onChange={(e) => {
                    saveTemplateSettings({ ...currentSettings, defaultWidth: currentSettings.defaultWidth || 450, defaultHeight: currentSettings.defaultHeight || 550, allowResize: e.target.checked });
                  }}
                  className="h-4 w-4 accent-purple-600"
                  data-testid="checkbox-template-allow-resize"
                />
                <Label className="text-stone-400 text-xs">Allow resize</Label>
              </div>
            </div>
          );
        })()}
        
        {!collapsed && (
          <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
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

      {propContextMenu && item.type === 'template' && createPortal(
        <div
          className="fixed inset-0 z-[9998]"
          onClick={() => setPropContextMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setPropContextMenu(null); }}
        >
          <div
            className="fixed bg-stone-900 border border-purple-700/60 rounded-lg shadow-2xl shadow-black/50 py-1 min-w-[160px]"
            style={{ left: propContextMenu.x, top: propContextMenu.y }}
            onClick={(e) => e.stopPropagation()}
            data-testid="property-context-menu"
          >
            <button
              className="w-full px-3 py-1.5 text-left text-xs text-stone-200 hover:bg-purple-800/30 flex items-center gap-2"
              onClick={() => {
                handleDuplicateProperty(propContextMenu.propId);
                setPropContextMenu(null);
              }}
              data-testid="context-menu-duplicate"
            >
              <Copy className="h-3 w-3 text-purple-400" /> Duplicate Property
            </button>
            <button
              className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-red-900/20 flex items-center gap-2"
              onClick={() => {
                handleDeleteProperty(propContextMenu.propId);
                setPropContextMenu(null);
              }}
              data-testid="context-menu-delete"
            >
              <Trash2 className="h-3 w-3" /> Delete Property
            </button>
          </div>
        </div>,
        document.body
      )}

      {propSettingsOpen && selectedProperty && item.type === 'template' && createPortal(
        <div
          className="fixed z-[9999]"
          style={{ left: propSettingsPanelPos.x, top: propSettingsPanelPos.y, width: propSettingsPanelSize.width, height: propSettingsPanelSize.height }}
          data-testid="floating-property-settings"
        >
          <div className="w-full h-full bg-stone-900 border border-purple-700/60 rounded-lg shadow-2xl shadow-black/50 flex flex-col overflow-hidden relative">
            <div
              className="flex items-center justify-between px-3 py-2 bg-stone-800 border-b border-purple-800/40 cursor-grab active:cursor-grabbing shrink-0"
              onPointerDown={handleSettingsDragDown}
              onPointerMove={handleSettingsDragMove}
              onPointerUp={handleSettingsDragUp}
            >
              <span className="text-xs font-medium text-purple-300">Property Settings</span>
              <Button variant="ghost" size="icon" onClick={() => { setPropSettingsOpen(false); setSelectedPropertyId(null); }} className="h-5 w-5 text-stone-500 hover:text-white" data-testid="button-close-property-settings">
                <X className="h-3 w-3" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <div className="space-y-1">
                <Label className="text-stone-500 text-[10px]">Name</Label>
                <Input
                  value={selectedProperty.label}
                  onChange={(e) => updatePropertyLayout(selectedProperty.id, { label: e.target.value })}
                  className="bg-stone-800 border-stone-600 text-stone-200 h-7 text-xs"
                  data-testid="input-prop-name"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-stone-500 text-[10px]">Key</Label>
                <Input
                  value={selectedProperty.key}
                  onChange={(e) => {
                    const newKey = e.target.value.replace(/[^a-zA-Z0-9]/g, '');
                    if (newKey && properties.some((p: any) => p.id !== selectedProperty.id && p.key === newKey)) {
                      return;
                    }
                    updatePropertyLayout(selectedProperty.id, { key: newKey });
                  }}
                  className="bg-stone-800 border-stone-600 text-stone-200 h-7 text-xs font-mono"
                  data-testid="input-prop-key"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-stone-500 text-[10px]">Type</Label>
                <Select
                  value={selectedProperty.type}
                  onValueChange={(v) => updatePropertyLayout(selectedProperty.id, { type: v })}
                >
                  <SelectTrigger className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs" data-testid="select-prop-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-stone-800 border-stone-700">
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="boolean">Boolean (Checkbox)</SelectItem>
                    <SelectItem value="list">List (Select)</SelectItem>
                    <SelectItem value="resource">Resource (Current/Max)</SelectItem>
                    <SelectItem value="textarea">Text Field (Multi-line)</SelectItem>
                    <SelectItem value="pfp">Profile Picture</SelectItem>
                    <SelectItem value="label">Label (Rich Text)</SelectItem>
                    <SelectItem value="button">Button (Action/Roll)</SelectItem>
                    <SelectItem value="divider">Divider (Separator)</SelectItem>
                  </SelectContent>
                </Select>
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
                {selectedProperty.type !== 'boolean' && selectedProperty.type !== 'label' && selectedProperty.type !== 'divider' && (
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
                )}
                {selectedProperty.type !== 'boolean' && selectedProperty.type !== 'divider' && (
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
                )}
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

              <div className="space-y-1">
                <Label className="text-stone-500 text-[10px]">Tooltip</Label>
                <Input
                  value={selectedProperty.tooltip || ''}
                  onChange={(e) => updatePropertyLayout(selectedProperty.id, { tooltip: e.target.value })}
                  placeholder="Hover description..."
                  className="bg-stone-800 border-stone-600 text-stone-200 h-7 text-xs"
                  data-testid="input-prop-tooltip"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-stone-500 text-[10px]">Default Value{selectedProperty.type === 'list' ? ' (comma-separated options)' : ''}</Label>
                {selectedProperty.type === 'label' ? (
                  <>
                    <Textarea
                      value={selectedProperty.defaultValue || ''}
                      onChange={(e) => updatePropertyLayout(selectedProperty.id, { defaultValue: e.target.value })}
                      placeholder="Enter rich text content. Use {{key}} for property references"
                      className="bg-stone-800 border-stone-600 text-stone-200 text-xs min-h-[60px]"
                      data-testid="input-prop-default"
                    />
                    <p className="text-stone-600 text-[9px]">Supports HTML and {"{{propertyKey}}"} references</p>
                  </>
                ) : (
                  <Input
                    value={selectedProperty.defaultValue || ''}
                    onChange={(e) => updatePropertyLayout(selectedProperty.id, { defaultValue: e.target.value })}
                    placeholder={selectedProperty.type === 'list' ? 'Option 1, Option 2, Option 3' : 'Default value...'}
                    className="bg-stone-800 border-stone-600 text-stone-200 h-7 text-xs"
                    data-testid="input-prop-default"
                  />
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-stone-500 text-[10px]">Parent</Label>
                <Select
                  value={selectedProperty.parentId || '__canvas_root__'}
                  onValueChange={(v) => updatePropertyLayout(selectedProperty.id, { parentId: v === '__canvas_root__' ? null : v })}
                >
                  <SelectTrigger className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs" data-testid="select-prop-parent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-stone-800 border-stone-700">
                    <SelectItem value="__canvas_root__" className="text-stone-400">Canvas Root (none)</SelectItem>
                    {layoutNodesList.map((n: any) => (
                      <SelectItem key={n.id} value={n.id} className="text-stone-200">
                        {n.name} ({n.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedProperty.type === 'text' && (
                <div className="space-y-1">
                  <Label className="text-stone-500 text-[10px]">Placeholder</Label>
                  <Input
                    value={selectedProperty.placeholder || ''}
                    onChange={(e) => updatePropertyLayout(selectedProperty.id, { placeholder: e.target.value })}
                    placeholder="Enter placeholder text..."
                    className="bg-stone-800 border-stone-600 text-stone-200 h-7 text-xs"
                    data-testid="input-prop-placeholder"
                  />
                </div>
              )}

              {selectedProperty.type === 'textarea' && (
                <div className="space-y-1">
                  <Label className="text-stone-500 text-[10px]">Placeholder</Label>
                  <Input
                    value={selectedProperty.placeholder || ''}
                    onChange={(e) => updatePropertyLayout(selectedProperty.id, { placeholder: e.target.value })}
                    placeholder="Enter placeholder text..."
                    className="bg-stone-800 border-stone-600 text-stone-200 h-7 text-xs"
                    data-testid="input-prop-textarea-placeholder"
                  />
                </div>
              )}

              {selectedProperty.type === 'number' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-stone-500 text-[10px]">Min</Label>
                      <Input
                        type="number"
                        value={selectedProperty.min ?? ''}
                        onChange={(e) => updatePropertyLayout(selectedProperty.id, { min: e.target.value ? Number(e.target.value) : undefined })}
                        className="bg-stone-800 border-stone-600 text-stone-200 h-7 text-xs"
                        data-testid="input-prop-min"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-stone-500 text-[10px]">Max</Label>
                      <Input
                        type="number"
                        value={selectedProperty.max ?? ''}
                        onChange={(e) => updatePropertyLayout(selectedProperty.id, { max: e.target.value ? Number(e.target.value) : undefined })}
                        className="bg-stone-800 border-stone-600 text-stone-200 h-7 text-xs"
                        data-testid="input-prop-max"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-stone-500 text-[10px]">Step</Label>
                      <Input
                        type="number"
                        value={selectedProperty.step ?? 1}
                        onChange={(e) => updatePropertyLayout(selectedProperty.id, { step: Number(e.target.value) || 1 })}
                        className="bg-stone-800 border-stone-600 text-stone-200 h-7 text-xs"
                        data-testid="input-prop-step"
                      />
                    </div>
                  </div>
                </div>
              )}

              {selectedProperty.type === 'resource' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedProperty.showBar ?? false}
                      onChange={(e) => updatePropertyLayout(selectedProperty.id, { showBar: e.target.checked })}
                      className="h-3 w-3 accent-purple-600"
                      data-testid="checkbox-prop-showbar"
                    />
                    <Label className="text-stone-500 text-[10px]">Show Progress Bar</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedProperty.allowOverMax ?? false}
                      onChange={(e) => updatePropertyLayout(selectedProperty.id, { allowOverMax: e.target.checked })}
                      className="h-3 w-3 accent-purple-600"
                      data-testid="checkbox-prop-allowovermax"
                    />
                    <Label className="text-stone-500 text-[10px]">Allow Current to Exceed Max</Label>
                  </div>
                  {selectedProperty.showBar && (
                    <div className="space-y-1">
                      <Label className="text-stone-500 text-[10px]">Bar Color</Label>
                      <input
                        type="color"
                        value={selectedProperty.barColor || '#d97706'}
                        onChange={(e) => updatePropertyLayout(selectedProperty.id, { barColor: e.target.value })}
                        className="w-7 h-7 rounded border border-stone-700 bg-stone-800 cursor-pointer p-0"
                        data-testid="input-prop-barcolor"
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedProperty.useGradient ?? false}
                      onChange={(e) => updatePropertyLayout(selectedProperty.id, { useGradient: e.target.checked })}
                      className="h-3 w-3 accent-purple-600"
                      data-testid="checkbox-prop-usegradient"
                    />
                    <Label className="text-stone-500 text-[10px]">Gradient Color (Low → High)</Label>
                  </div>
                  {selectedProperty.showBar && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-stone-500 text-[10px]">Color Thresholds</Label>
                        <button
                          type="button"
                          onClick={() => {
                            const current = selectedProperty.colorThresholds || [];
                            updatePropertyLayout(selectedProperty.id, { colorThresholds: [...current, { percent: 50, color: '#f59e0b' }] });
                          }}
                          className="text-[9px] text-purple-400 hover:text-purple-300 px-1"
                          data-testid="button-add-threshold"
                        >
                          + Add Threshold
                        </button>
                      </div>
                      {!(selectedProperty.colorThresholds?.length) && (
                        <button
                          type="button"
                          onClick={() => {
                            updatePropertyLayout(selectedProperty.id, { colorThresholds: [{ percent: 25, color: '#ef4444' }, { percent: 50, color: '#f59e0b' }, { percent: 75, color: '#22c55e' }] });
                          }}
                          className="text-[9px] text-stone-500 hover:text-stone-400 underline"
                          data-testid="button-default-thresholds"
                        >
                          Use defaults (25% red, 50% yellow, 75% green)
                        </button>
                      )}
                      {(selectedProperty.colorThresholds || []).map((th: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={th.percent}
                            onChange={(e) => {
                              const updated = [...(selectedProperty.colorThresholds || [])];
                              updated[idx] = { ...updated[idx], percent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) };
                              updatePropertyLayout(selectedProperty.id, { colorThresholds: updated });
                            }}
                            className="bg-stone-900 border border-stone-600 text-stone-200 h-6 w-14 text-[10px] rounded px-1"
                            data-testid={`input-threshold-percent-${idx}`}
                          />
                          <span className="text-stone-500 text-[9px]">%</span>
                          <input
                            type="color"
                            value={th.color}
                            onChange={(e) => {
                              const updated = [...(selectedProperty.colorThresholds || [])];
                              updated[idx] = { ...updated[idx], color: e.target.value };
                              updatePropertyLayout(selectedProperty.id, { colorThresholds: updated });
                            }}
                            className="w-6 h-6 rounded border border-stone-700 bg-stone-800 cursor-pointer p-0"
                            data-testid={`input-threshold-color-${idx}`}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const updated = (selectedProperty.colorThresholds || []).filter((_: any, i: number) => i !== idx);
                              updatePropertyLayout(selectedProperty.id, { colorThresholds: updated });
                            }}
                            className="text-red-400 hover:text-red-300 text-xs ml-1"
                            data-testid={`button-delete-threshold-${idx}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {selectedProperty.type === 'list' && (
                <div className="space-y-1">
                  <p className="text-stone-600 text-[9px]">Use the Default Value field to define options (separate with commas)</p>
                </div>
              )}

              {selectedProperty.type === 'button' && (
                <>
                  <div className="space-y-1">
                    <Label className="text-stone-500 text-[10px]">Roll Formula</Label>
                    <Input
                      value={selectedProperty.rollFormula || ''}
                      onChange={(e) => updatePropertyLayout(selectedProperty.id, { rollFormula: e.target.value })}
                      placeholder="e.g. 1d20+{{strength_mod}}"
                      className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs font-mono"
                      data-testid="input-prop-rollformula"
                    />
                    <span className="text-stone-600 text-[9px]">Use {"{{key}}"} to reference property values</span>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-stone-500 text-[10px]">Button Label</Label>
                    <Input
                      value={selectedProperty.buttonLabel || ''}
                      onChange={(e) => updatePropertyLayout(selectedProperty.id, { buttonLabel: e.target.value })}
                      placeholder="Roll Attack"
                      className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs"
                      data-testid="input-prop-buttonlabel"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-stone-500 text-[10px]">Button Color</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={selectedProperty.buttonColor || '#d97706'}
                        onChange={(e) => updatePropertyLayout(selectedProperty.id, { buttonColor: e.target.value })}
                        className="h-7 w-10 bg-stone-900 border border-stone-600 rounded cursor-pointer"
                        data-testid="input-prop-buttoncolor"
                      />
                      <Input
                        value={selectedProperty.buttonColor || '#d97706'}
                        onChange={(e) => updatePropertyLayout(selectedProperty.id, { buttonColor: e.target.value })}
                        className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs font-mono flex-1"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-stone-500 text-[10px]">Resource Cost</Label>
                    <div className="flex gap-2">
                      <Input
                        value={selectedProperty.resourceCost?.propertyKey || ''}
                        onChange={(e) => updatePropertyLayout(selectedProperty.id, { 
                          resourceCost: { ...(selectedProperty.resourceCost || {}), propertyKey: e.target.value, amount: selectedProperty.resourceCost?.amount || 1 }
                        })}
                        placeholder="property key"
                        className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs font-mono flex-1"
                        data-testid="input-prop-resourcecost-key"
                      />
                      <Input
                        type="number"
                        value={selectedProperty.resourceCost?.amount || ''}
                        onChange={(e) => updatePropertyLayout(selectedProperty.id, { 
                          resourceCost: { ...(selectedProperty.resourceCost || {}), propertyKey: selectedProperty.resourceCost?.propertyKey || '', amount: Number(e.target.value) || 0 }
                        })}
                        placeholder="cost"
                        className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs w-16"
                        data-testid="input-prop-resourcecost-amount"
                      />
                    </div>
                    <span className="text-stone-600 text-[9px]">Deducts from a resource property each use</span>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-stone-500 text-[10px]">Max Uses</Label>
                    <div className="flex gap-2 items-center">
                      <Input
                        type="number"
                        value={selectedProperty.maxUses || ''}
                        onChange={(e) => updatePropertyLayout(selectedProperty.id, { maxUses: Number(e.target.value) || 0 })}
                        placeholder="0 = unlimited"
                        className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs flex-1"
                        data-testid="input-prop-maxuses"
                      />
                      <Select 
                        value={selectedProperty.usesPerRest || 'none'} 
                        onValueChange={(v) => updatePropertyLayout(selectedProperty.id, { usesPerRest: v })}
                      >
                        <SelectTrigger className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs w-24" data-testid="select-prop-usesperest">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-stone-800 border-stone-600">
                          <SelectItem value="none">No Reset</SelectItem>
                          <SelectItem value="short">Short Rest</SelectItem>
                          <SelectItem value="long">Long Rest</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <span className="text-stone-600 text-[9px]">Limit uses, optionally reset on rest</span>
                  </div>
                  <div className="space-y-2 pt-2 border-t border-stone-700/50">
                    <div className="text-xs text-stone-400 font-medium">Targeting</div>
                    <select
                      className="w-full bg-stone-800 border border-stone-700 rounded text-xs p-1.5 text-stone-200"
                      value={selectedProperty?.metadata?.buttonConfig?.targetingConfig?.type || 'none'}
                      onChange={(e) => {
                        const currentConfig = selectedProperty?.metadata?.buttonConfig || {};
                        const currentTargeting = currentConfig.targetingConfig || {};
                        updatePropertyLayout(selectedPropertyId!, {
                          buttonConfig: {
                            ...currentConfig,
                            targetingConfig: { ...currentTargeting, type: e.target.value },
                          },
                        });
                      }}
                      data-testid="targeting-type-select"
                    >
                      <option value="none">No Targeting</option>
                      <option value="self">Self</option>
                      <option value="single">Single Target</option>
                      <option value="aoe">Area of Effect</option>
                    </select>
                    {(selectedProperty?.metadata?.buttonConfig?.targetingConfig?.type === 'aoe') && (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="text-xs text-stone-500 block mb-0.5">Shape</label>
                            <select className="w-full bg-stone-800 border border-stone-700 rounded text-xs p-1.5 text-stone-200"
                              value={selectedProperty?.metadata?.buttonConfig?.targetingConfig?.aoeShape || 'circle'}
                              onChange={(e) => {
                                const cc = selectedProperty?.metadata?.buttonConfig || {};
                                const ct = cc.targetingConfig || {};
                                updatePropertyLayout(selectedPropertyId!, { buttonConfig: { ...cc, targetingConfig: { ...ct, aoeShape: e.target.value } } });
                              }}
                              data-testid="aoe-shape-select"
                            >
                              <option value="circle">Circle</option>
                              <option value="square">Square</option>
                              <option value="cone">Cone</option>
                              <option value="line">Line</option>
                            </select>
                          </div>
                          <div className="flex-1">
                            <label className="text-xs text-stone-500 block mb-0.5">AOE Size (ft)</label>
                            <input type="number" className="w-full bg-stone-800 border border-stone-700 rounded text-xs p-1.5 text-stone-200"
                              value={selectedProperty?.metadata?.buttonConfig?.targetingConfig?.aoeRange || 20}
                              onChange={(e) => {
                                const cc = selectedProperty?.metadata?.buttonConfig || {};
                                const ct = cc.targetingConfig || {};
                                updatePropertyLayout(selectedPropertyId!, { buttonConfig: { ...cc, targetingConfig: { ...ct, aoeRange: Number(e.target.value) } } });
                              }}
                              data-testid="aoe-range-input"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="text-xs text-stone-500 block mb-0.5">Cast Range (ft)</label>
                            <input type="number" className="w-full bg-stone-800 border border-stone-700 rounded text-xs p-1.5 text-stone-200"
                              value={selectedProperty?.metadata?.buttonConfig?.targetingConfig?.spellRange || 60}
                              onChange={(e) => {
                                const cc = selectedProperty?.metadata?.buttonConfig || {};
                                const ct = cc.targetingConfig || {};
                                updatePropertyLayout(selectedPropertyId!, { buttonConfig: { ...cc, targetingConfig: { ...ct, spellRange: Number(e.target.value) } } });
                              }}
                              data-testid="spell-range-input"
                            />
                          </div>
                          {(selectedProperty?.metadata?.buttonConfig?.targetingConfig?.aoeShape === 'line' || selectedProperty?.metadata?.buttonConfig?.targetingConfig?.aoeShape === 'cone') && (
                            <div className="flex-1">
                              <label className="text-xs text-stone-500 block mb-0.5">Width (ft)</label>
                              <input type="number" className="w-full bg-stone-800 border border-stone-700 rounded text-xs p-1.5 text-stone-200"
                                value={selectedProperty?.metadata?.buttonConfig?.targetingConfig?.aoeWidth || 5}
                                onChange={(e) => {
                                  const cc = selectedProperty?.metadata?.buttonConfig || {};
                                  const ct = cc.targetingConfig || {};
                                  updatePropertyLayout(selectedPropertyId!, { buttonConfig: { ...cc, targetingConfig: { ...ct, aoeWidth: Number(e.target.value) } } });
                                }}
                              />
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="text-xs text-stone-500 block mb-0.5">Hit Formula (optional)</label>
                          <input className="w-full bg-stone-800 border border-stone-700 rounded text-xs p-1.5 text-stone-200"
                            placeholder="e.g., 1d20+{{spellmod}}"
                            value={selectedProperty?.metadata?.buttonConfig?.targetingConfig?.hitFormula || ''}
                            onChange={(e) => {
                              const cc = selectedProperty?.metadata?.buttonConfig || {};
                              const ct = cc.targetingConfig || {};
                              updatePropertyLayout(selectedPropertyId!, { buttonConfig: { ...cc, targetingConfig: { ...ct, hitFormula: e.target.value } } });
                            }}
                            data-testid="hit-formula-input"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-stone-500 block mb-0.5">Damage Formula (optional)</label>
                          <input className="w-full bg-stone-800 border border-stone-700 rounded text-xs p-1.5 text-stone-200"
                            placeholder="e.g., 8d6"
                            value={selectedProperty?.metadata?.buttonConfig?.targetingConfig?.damageFormula || ''}
                            onChange={(e) => {
                              const cc = selectedProperty?.metadata?.buttonConfig || {};
                              const ct = cc.targetingConfig || {};
                              updatePropertyLayout(selectedPropertyId!, { buttonConfig: { ...cc, targetingConfig: { ...ct, damageFormula: e.target.value } } });
                            }}
                            data-testid="damage-formula-input"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {(selectedProperty.type === 'number' || selectedProperty.type === 'resource' || selectedProperty.type === 'text') && (
                <div className="space-y-1">
                  <Label className="text-stone-500 text-[10px]">Calculation Formula</Label>
                  <Input
                    value={selectedProperty.calculationExpression || ''}
                    onChange={(e) => updatePropertyLayout(selectedProperty.id, { calculationExpression: e.target.value })}
                    placeholder="e.g. strength + level * 2"
                    className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs font-mono"
                    data-testid="input-prop-calculation"
                  />
                  <span className="text-stone-600 text-[9px]">Reference other properties by key</span>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-stone-500 text-[10px]">Visibility Condition</Label>
                <Input
                  value={selectedProperty.visibilityExpression || ''}
                  onChange={(e) => updatePropertyLayout(selectedProperty.id, { visibilityExpression: e.target.value })}
                  placeholder="e.g. level >= 5"
                  className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs font-mono"
                  data-testid="input-prop-visibility"
                />
                <span className="text-stone-600 text-[9px]">Show only when condition is true</span>
              </div>

              <div className="border-t border-stone-700/50 pt-3">
                <PropertyStyleEditor
                  style={selectedProperty.style || {}}
                  onChange={(newStyle: PropertyStyle) => updatePropertyLayout(selectedProperty.id, { style: newStyle })}
                  propertyType={selectedProperty.type}
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => { handleDeleteProperty(selectedProperty.id); setSelectedPropertyId(null); setPropSettingsOpen(false); }}
                className="w-full border-red-800/50 text-red-400 hover:bg-red-900/20 hover:text-red-300 h-7 text-xs"
                data-testid={`button-delete-property-${selectedProperty.id}`}
              >
                <Trash2 className="h-3 w-3 mr-1" /> Delete Property
              </Button>
            </div>

            <div
              className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
              onPointerDown={handleSettingsResizeDown}
              onPointerMove={handleSettingsResizeMove}
              onPointerUp={handleSettingsResizeUp}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" className="text-stone-600">
                <path d="M14 14L8 14M14 14L14 8M14 14L6 6" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
            </div>
          </div>
        </div>,
        document.body
      )}

      <input
        ref={tabImageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && tabImageTarget) {
            const reader = new FileReader();
            reader.onload = (ev) => {
              const base64 = ev.target?.result as string;
              const parentNode = layoutNodes[tabImageTarget.tabNodeId];
              if (parentNode) {
                const updatedNodes = {
                  ...layoutNodes,
                  [tabImageTarget.tabNodeId]: {
                    ...parentNode,
                    behaviorConfig: {
                      ...parentNode.behaviorConfig,
                      tabConfig: {
                        ...parentNode.behaviorConfig?.tabConfig,
                        tabIcons: {
                          ...parentNode.behaviorConfig?.tabConfig?.tabIcons,
                          [tabImageTarget.childId]: { type: 'image' as const, value: base64, showName: parentNode.behaviorConfig?.tabConfig?.tabIcons?.[tabImageTarget.childId]?.showName },
                        },
                      },
                    },
                  },
                };
                updateTemplateMutationSheet.mutate({ data: JSON.stringify({ ...templateData, layoutNodes: updatedNodes }) });
                toast({ title: 'Tab image set' });
              }
              setTabImageTarget(null);
            };
            reader.readAsDataURL(file);
          }
          e.target.value = '';
        }}
      />
      <input
        ref={pfpFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && pfpEditorOpen) {
            const reader = new FileReader();
            reader.onload = (ev) => {
              const base64 = ev.target?.result as string;
              setPfpCropImage(base64);
            };
            reader.readAsDataURL(file);
          }
          e.target.value = '';
        }}
      />

      {pfpEditorOpen && item.type === 'actor' && createPortal(
        <div
          className="fixed z-[9999]"
          style={{ left: pfpEditorPos.x, top: pfpEditorPos.y, width: pfpCropImage ? 400 : 260 }}
          data-testid="pfp-editor-panel"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="bg-stone-900 border border-purple-700/60 rounded-lg shadow-2xl shadow-black/50 overflow-hidden">
            <div
              className="flex items-center justify-between px-3 py-2 bg-stone-800 border-b border-purple-800/40 cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => {
                e.preventDefault();
                const el = e.currentTarget as HTMLElement;
                el.setPointerCapture(e.pointerId);
                setPfpDragging(true);
                pfpDragRef.current = { startX: e.clientX, startY: e.clientY, posX: pfpEditorPos.x, posY: pfpEditorPos.y };
              }}
              onPointerMove={(e) => {
                if (!pfpDragging) return;
                setPfpEditorPos({
                  x: pfpDragRef.current.posX + (e.clientX - pfpDragRef.current.startX),
                  y: pfpDragRef.current.posY + (e.clientY - pfpDragRef.current.startY),
                });
              }}
              onPointerUp={(e) => {
                setPfpDragging(false);
                const el = e.currentTarget as HTMLElement;
                if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
              }}
            >
              <span className="text-xs font-medium text-purple-300">Profile Picture</span>
              <button
                onClick={(e) => { e.stopPropagation(); setPfpEditorOpen(null); setPfpCropImage(null); }}
                className="relative z-10 h-6 w-6 flex items-center justify-center rounded text-stone-400 hover:text-white hover:bg-stone-700 transition-colors"
                data-testid="button-close-pfp-editor"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3 space-y-3">
              {pfpCropImage ? (
                <div className="space-y-3">
                  <div
                    className="relative overflow-hidden bg-stone-950 rounded border border-stone-700 select-none"
                    style={{ height: 300 }}
                  >
                    <img
                      ref={pfpCropImgRef}
                      src={pfpCropImage}
                      alt="Crop preview"
                      className="absolute top-0 left-0 w-full h-full object-contain pointer-events-none"
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        const container = img.parentElement!;
                        const cw = container.clientWidth;
                        const ch = container.clientHeight;
                        const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
                        const displayW = img.naturalWidth * scale;
                        const displayH = img.naturalHeight * scale;
                        const initSize = Math.min(displayW, displayH, 150);
                        const offsetX = (cw - displayW) / 2;
                        const offsetY = (ch - displayH) / 2;
                        setPfpCropArea({
                          x: offsetX + (displayW - initSize) / 2,
                          y: offsetY + (displayH - initSize) / 2,
                          size: initSize,
                        });
                      }}
                    />
                    <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: 'inset 0 0 0 9999px rgba(0,0,0,0.5)' }} />
                    <div
                      className="absolute border-2 border-amber-400 bg-transparent cursor-move"
                      style={{
                        left: pfpCropArea.x,
                        top: pfpCropArea.y,
                        width: pfpCropArea.size,
                        height: pfpCropArea.size,
                        boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                      }}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const el = e.currentTarget;
                        el.setPointerCapture(e.pointerId);
                        const startX = e.clientX;
                        const startY = e.clientY;
                        const startArea = { ...pfpCropArea };
                        const container = el.parentElement!;
                        const cw = container.clientWidth;
                        const ch = container.clientHeight;
                        const onMove = (ev: PointerEvent) => {
                          const dx = ev.clientX - startX;
                          const dy = ev.clientY - startY;
                          setPfpCropArea({
                            ...startArea,
                            x: Math.max(0, Math.min(cw - startArea.size, startArea.x + dx)),
                            y: Math.max(0, Math.min(ch - startArea.size, startArea.y + dy)),
                          });
                        };
                        const onUp = () => {
                          el.removeEventListener('pointermove', onMove);
                          el.removeEventListener('pointerup', onUp);
                        };
                        el.addEventListener('pointermove', onMove);
                        el.addEventListener('pointerup', onUp);
                      }}
                    >
                      {[
                        { pos: 'top-0 left-0', cursor: 'nw-resize', corner: 'tl' },
                        { pos: 'top-0 right-0', cursor: 'ne-resize', corner: 'tr' },
                        { pos: 'bottom-0 left-0', cursor: 'sw-resize', corner: 'bl' },
                        { pos: 'bottom-0 right-0', cursor: 'se-resize', corner: 'br' },
                      ].map(({ pos, cursor, corner }) => (
                        <div
                          key={corner}
                          className={`absolute ${pos} w-3 h-3 bg-amber-400 border border-amber-600`}
                          style={{ cursor, transform: 'translate(-50%, -50%)', ...(corner.includes('r') ? { left: 'auto', right: 0, transform: 'translate(50%, -50%)' } : {}), ...(corner.includes('b') ? { top: 'auto', bottom: 0, transform: corner.includes('r') ? 'translate(50%, 50%)' : 'translate(-50%, 50%)' } : {}) }}
                          onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const handle = e.currentTarget;
                            handle.setPointerCapture(e.pointerId);
                            const startX = e.clientX;
                            const startY = e.clientY;
                            const startArea = { ...pfpCropArea };
                            const container = handle.parentElement!.parentElement!;
                            const cw = container.clientWidth;
                            const ch = container.clientHeight;
                            const onMove = (ev: PointerEvent) => {
                              const dx = ev.clientX - startX;
                              const dy = ev.clientY - startY;
                              let delta = 0;
                              if (corner === 'br') delta = Math.max(dx, dy);
                              else if (corner === 'bl') delta = Math.max(-dx, dy);
                              else if (corner === 'tr') delta = Math.max(dx, -dy);
                              else delta = Math.max(-dx, -dy);
                              const newSize = Math.max(40, Math.min(Math.min(cw, ch), startArea.size + delta));
                              let newX = startArea.x;
                              let newY = startArea.y;
                              if (corner.includes('l')) newX = startArea.x + startArea.size - newSize;
                              if (corner.includes('t')) newY = startArea.y + startArea.size - newSize;
                              newX = Math.max(0, Math.min(cw - newSize, newX));
                              newY = Math.max(0, Math.min(ch - newSize, newY));
                              setPfpCropArea({ x: newX, y: newY, size: newSize });
                            };
                            const onUp = () => {
                              handle.removeEventListener('pointermove', onMove);
                              handle.removeEventListener('pointerup', onUp);
                            };
                            handle.addEventListener('pointermove', onMove);
                            handle.addEventListener('pointerup', onUp);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <canvas ref={pfpCropCanvasRef} className="hidden" />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        const img = pfpCropImgRef.current;
                        const canvas = pfpCropCanvasRef.current;
                        if (!img || !canvas || !pfpEditorOpen) return;
                        const container = img.parentElement!;
                        const cw = container.clientWidth;
                        const ch = container.clientHeight;
                        const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
                        const displayW = img.naturalWidth * scale;
                        const displayH = img.naturalHeight * scale;
                        const offsetX = (cw - displayW) / 2;
                        const offsetY = (ch - displayH) / 2;
                        const srcX = ((pfpCropArea.x - offsetX) / scale) * (img.naturalWidth / img.naturalWidth);
                        const srcY = ((pfpCropArea.y - offsetY) / scale) * (img.naturalHeight / img.naturalHeight);
                        const srcSize = pfpCropArea.size / scale;
                        const cropX = Math.max(0, (pfpCropArea.x - offsetX) / scale);
                        const cropY = Math.max(0, (pfpCropArea.y - offsetY) / scale);
                        const cropSize = Math.min(pfpCropArea.size / scale, img.naturalWidth - cropX, img.naturalHeight - cropY);
                        const outSize = 256;
                        canvas.width = outSize;
                        canvas.height = outSize;
                        const ctx = canvas.getContext('2d')!;
                        ctx.clearRect(0, 0, outSize, outSize);
                        ctx.drawImage(img, cropX, cropY, cropSize, cropSize, 0, 0, outSize, outSize);
                        const croppedBase64 = canvas.toDataURL('image/png');
                        handleActorValueChange(pfpEditorOpen, croppedBase64);
                        setPfpCropImage(null);
                      }}
                      className="flex-1 bg-amber-600 hover:bg-amber-700 text-white h-7 text-xs"
                      data-testid="button-pfp-save-crop"
                    >
                      Save Crop
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPfpCropImage(null)}
                      className="flex-1 border-stone-600 text-stone-400 hover:bg-stone-800 h-7 text-xs"
                      data-testid="button-pfp-cancel-crop"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {actorValues[pfpEditorOpen] ? (
                    <div className="flex justify-center">
                      <img src={actorValues[pfpEditorOpen] as string} alt="Current PFP" className="w-24 h-24 object-cover rounded border border-stone-600" />
                    </div>
                  ) : (
                    <div className="flex justify-center">
                      <div className="w-24 h-24 bg-stone-800 rounded border border-stone-600 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-stone-500"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); pfpFileInputRef.current?.click(); }}
                      className="flex-1 bg-purple-600 hover:bg-purple-700 text-white h-7 text-xs"
                      data-testid="button-pfp-upload"
                    >
                      <Upload className="h-3 w-3 mr-1" /> Upload
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => { e.stopPropagation(); setPfpImageBrowserOpen(true); }}
                      className="flex-1 border-purple-700/50 text-purple-300 hover:bg-purple-900/20 h-7 text-xs"
                      data-testid="button-pfp-library"
                    >
                      <Folder className="h-3 w-3 mr-1" /> Library
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleActorValueChange(pfpEditorOpen, '');
                      }}
                      className="flex-1 border-red-800/50 text-red-400 hover:bg-red-900/20 h-7 text-xs"
                      data-testid="button-pfp-remove"
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Remove
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {pfpImageBrowserOpen && (
        <ImageBrowser
          open={pfpImageBrowserOpen}
          onOpenChange={setPfpImageBrowserOpen}
          onSelect={(base64: string) => {
            setPfpCropImage(base64);
            setPfpImageBrowserOpen(false);
          }}
          title="Choose Profile Picture"
        />
      )}

      {addingProperty && createPortal(
        <div
          className="fixed bg-stone-900 border border-purple-700/50 rounded-lg shadow-2xl shadow-purple-900/30 overflow-hidden"
          style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '380px', maxHeight: '85vh', zIndex: 9999 }}
          onMouseDown={(e) => e.stopPropagation()}
          data-testid="add-property-form"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-stone-700 bg-stone-800/50 rounded-t-lg">
            <span className="text-xs font-semibold text-purple-300">
              {containerAddTarget ? 'Add Property to Container' : 'Add New Property'}
            </span>
            <button onClick={() => { setAddingProperty(false); resetNewPropState(); }} className="text-stone-400 hover:text-stone-200">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="overflow-y-auto p-3 space-y-3" style={{ maxHeight: 'calc(85vh - 44px)' }}>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-stone-400 text-[10px]">Key</Label>
                <Input
                  value={newPropKey}
                  onChange={(e) => setNewPropKey(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                  placeholder="hitPoints"
                  className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs"
                  data-testid="input-property-key"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <Label className="text-stone-400 text-[10px]">Label</Label>
                <Input
                  value={newPropLabel}
                  onChange={(e) => setNewPropLabel(e.target.value)}
                  placeholder="Hit Points"
                  className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs"
                  data-testid="input-property-label"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-stone-400 text-[10px]">Type</Label>
                <Select value={newPropType} onValueChange={(v: any) => handleNewPropTypeChange(v)}>
                  <SelectTrigger className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs" data-testid="select-property-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-stone-800 border-stone-700 z-[10000]">
                    <SelectItem value="text" className="text-stone-200 text-xs">Text</SelectItem>
                    <SelectItem value="number" className="text-stone-200 text-xs">Number</SelectItem>
                    <SelectItem value="boolean" className="text-stone-200 text-xs">Boolean (Checkbox)</SelectItem>
                    <SelectItem value="select" className="text-stone-200 text-xs">List (Select)</SelectItem>
                    <SelectItem value="resource" className="text-stone-200 text-xs">Resource (Current/Max)</SelectItem>
                    <SelectItem value="textarea" className="text-stone-200 text-xs">Text Field (Multi-line)</SelectItem>
                    <SelectItem value="pfp" className="text-stone-200 text-xs">Profile Picture</SelectItem>
                    <SelectItem value="label" className="text-stone-200 text-xs">Label (Rich Text)</SelectItem>
                    <SelectItem value="button" className="text-stone-200 text-xs">Button (Action/Roll)</SelectItem>
                    <SelectItem value="divider" className="text-stone-200 text-xs">Divider (Separator)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-stone-400 text-[10px]">Label Position</Label>
                <Select value={newPropLabelPosition} onValueChange={(v) => setNewPropLabelPosition(v)}>
                  <SelectTrigger className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-stone-800 border-stone-700 z-[10000]">
                    <SelectItem value="top" className="text-stone-200 text-xs">Top</SelectItem>
                    <SelectItem value="left" className="text-stone-200 text-xs">Left</SelectItem>
                    <SelectItem value="hidden" className="text-stone-200 text-xs">Hidden</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-stone-400 text-[10px]">Default Value{newPropType === 'select' ? ' (comma-separated options)' : ''}</Label>
              {newPropType === 'label' ? (
                <>
                  <Textarea
                    value={newPropDefault}
                    onChange={(e) => setNewPropDefault(e.target.value)}
                    placeholder="Enter rich text content. Use {{key}} for property references"
                    className="bg-stone-900 border-stone-600 text-stone-200 text-xs min-h-[60px]"
                    data-testid="input-property-default"
                  />
                  <p className="text-stone-600 text-[9px]">Supports HTML and {"{{propertyKey}}"} references</p>
                </>
              ) : (
              <Input
                value={newPropDefault}
                onChange={(e) => setNewPropDefault(e.target.value)}
                placeholder="Default value..."
                className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs"
                data-testid="input-property-default"
              />
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-stone-400 text-[10px]">Tooltip</Label>
              <Input
                value={newPropTooltip}
                onChange={(e) => setNewPropTooltip(e.target.value)}
                placeholder="Hover description..."
                className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs"
              />
            </div>

            <div className="border-t border-stone-700 pt-2">
              <Label className="text-stone-400 text-[10px] font-medium">Position & Size</Label>
              <div className="grid grid-cols-4 gap-1.5 mt-1">
                <div className="space-y-0.5">
                  <Label className="text-stone-500 text-[9px]">X</Label>
                  <Input type="number" value={newPropX} onChange={(e) => setNewPropX(Number(e.target.value))} className="bg-stone-900 border-stone-600 text-stone-200 h-6 text-[10px] px-1" />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-stone-500 text-[9px]">Y</Label>
                  <Input type="number" value={newPropY} onChange={(e) => setNewPropY(Number(e.target.value))} className="bg-stone-900 border-stone-600 text-stone-200 h-6 text-[10px] px-1" />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-stone-500 text-[9px]">Width</Label>
                  <Input type="number" value={newPropWidth} onChange={(e) => setNewPropWidth(Number(e.target.value))} className="bg-stone-900 border-stone-600 text-stone-200 h-6 text-[10px] px-1" />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-stone-500 text-[9px]">Height</Label>
                  <Input type="number" value={newPropHeight} onChange={(e) => setNewPropHeight(Number(e.target.value))} className="bg-stone-900 border-stone-600 text-stone-200 h-6 text-[10px] px-1" />
                </div>
              </div>
            </div>

            <div className="border-t border-stone-700 pt-2">
              <Label className="text-stone-400 text-[10px] font-medium">Font Sizes</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div className="space-y-0.5">
                  <Label className="text-stone-500 text-[9px]">Label Font</Label>
                  <Input type="number" value={newPropLabelFontSize} onChange={(e) => setNewPropLabelFontSize(Number(e.target.value))} min={8} max={24} className="bg-stone-900 border-stone-600 text-stone-200 h-6 text-[10px] px-1" />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-stone-500 text-[9px]">Value Font</Label>
                  <Input type="number" value={newPropValueFontSize} onChange={(e) => setNewPropValueFontSize(Number(e.target.value))} min={8} max={24} className="bg-stone-900 border-stone-600 text-stone-200 h-6 text-[10px] px-1" />
                </div>
              </div>
            </div>

            <div className="border-t border-stone-700 pt-2">
              <PropertyStyleEditor style={newPropStyle} onChange={setNewPropStyle} propertyType={newPropType as any} />
            </div>

            <div className="flex gap-2 pt-1 border-t border-stone-700">
              <Button variant="outline" size="sm" onClick={() => { setAddingProperty(false); resetNewPropState(); }} className="flex-1 border-stone-600 text-stone-400 h-7 text-xs" data-testid="button-cancel-property">
                Cancel
              </Button>
              <Button size="sm" onClick={handleAddProperty} disabled={!newPropKey.trim() || !newPropLabel.trim()} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white h-7 text-xs" data-testid="button-save-property">
                Create Property
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {rollResultVisible && lastRollResult && (
        <div 
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999] animate-in slide-in-from-bottom-4 fade-in duration-300"
          onClick={() => setRollResultVisible(false)}
        >
          <div className="bg-stone-900/95 border-2 border-amber-500/50 rounded-xl px-6 py-4 shadow-2xl backdrop-blur-sm min-w-[280px] max-w-[400px]">
            <div className="text-amber-400 font-bold text-lg text-center mb-1">
              🎲 {lastRollResult.expression}
            </div>
            <div className="text-stone-400 text-sm text-center mb-2">
              {formatRollResult(lastRollResult).split('=')[0]?.split('→')[1]?.trim() || ''}
            </div>
            <div className="text-white font-bold text-3xl text-center">
              {lastRollResult.total}
            </div>
          </div>
        </div>
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
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

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

  const seedArcanaMutation = useMutation({
    mutationFn: () => api.seedArcanaTemplates(campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sandbox-templates', campaignId] });
      toast({ title: "Arcana Adventure templates loaded", description: "Character, Weapon, and Spell templates have been created." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to load templates", description: error?.message || "Unknown error", variant: "destructive" });
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

  const updateFolderMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updateSandboxFolder(campaignId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sandbox-folders', campaignId] });
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updateSandboxTemplate(campaignId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sandbox-templates', campaignId] });
    },
  });

  const updateActorMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updateSandboxActor(campaignId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sandbox-actors', campaignId] });
    },
  });

  const folderColors = [
    { name: 'Default', value: null, hex: '#d97706' },
    { name: 'Red', value: '#ef4444', hex: '#ef4444' },
    { name: 'Orange', value: '#f97316', hex: '#f97316' },
    { name: 'Yellow', value: '#eab308', hex: '#eab308' },
    { name: 'Green', value: '#22c55e', hex: '#22c55e' },
    { name: 'Blue', value: '#3b82f6', hex: '#3b82f6' },
    { name: 'Purple', value: '#a855f7', hex: '#a855f7' },
    { name: 'Pink', value: '#ec4899', hex: '#ec4899' },
    { name: 'Cyan', value: '#06b6d4', hex: '#06b6d4' },
  ];

  const isSandboxDrag = (e: React.DragEvent) => {
    return e.dataTransfer.types.includes('application/sandbox-actor-move') ||
           e.dataTransfer.types.includes('application/sandbox-template-move') ||
           e.dataTransfer.types.includes('text/plain');
  };

  const handleItemDrop = (folderId: string | null, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(null);
    const templateData = e.dataTransfer.getData('application/sandbox-template-move');
    const actorData = e.dataTransfer.getData('application/sandbox-actor-move');
    if (templateData) {
      try { const { id } = JSON.parse(templateData); updateTemplateMutation.mutate({ id, data: { folderId } }); } catch {}
    } else if (actorData) {
      try { const { id } = JSON.parse(actorData); updateActorMutation.mutate({ id, data: { folderId } }); } catch {}
    } else {
      const plainData = e.dataTransfer.getData('text/plain');
      if (plainData) {
        try {
          const { id, type } = JSON.parse(plainData);
          if (type === 'template') updateTemplateMutation.mutate({ id, data: { folderId } });
          else if (type === 'actor') updateActorMutation.mutate({ id, data: { folderId } });
        } catch {}
      }
    }
  };

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

  const MIN_SHEET_WIDTH = 280;
  const MAX_SHEET_WIDTH = 900;
  const MIN_SHEET_HEIGHT = 200;
  const MAX_SHEET_HEIGHT = 800;

  const renderItem = (item: any, type: 'actor' | 'template') => (
    <div key={item.id}>
      <div
        className="flex items-center justify-between py-2 px-3 bg-stone-800/30 border border-stone-700/50 rounded-lg hover:bg-stone-800/60 transition-colors cursor-pointer group"
        onClick={() => type === 'actor' ? onOpenActor(item) : onOpenTemplate(item)}
        draggable
        onDragStart={(e) => {
          const payload = JSON.stringify({ id: item.id, name: item.name, type });
          e.dataTransfer.setData('text/plain', payload);
          e.dataTransfer.setData(`application/sandbox-${type}-move`, payload);
          if (type === 'actor') {
            e.dataTransfer.setData('application/sandbox-actor', payload);
          }
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragEnd={() => setDragOverFolderId(null)}
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
            {type === 'actor' ? 'Actor' : 'Template'}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); type === 'actor' ? deleteActorMutation.mutate(item.id) : deleteTemplateMutation.mutate(item.id); }}
            className="h-7 w-7 text-stone-500 hover:text-red-400 hover:bg-red-900/20"
            data-testid={`button-delete-${type}-${item.id}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );

  const renderFolder = (folder: any, depth: number = 0) => {
    const isExpanded = expandedFolders.has(folder.id);
    const childFolders = folders.filter((f: any) => f.parentId === folder.id);
    const folderActors = actors.filter((a: any) => a.folderId === folder.id);
    const folderTemplates = templates.filter((t: any) => t.folderId === folder.id);
    const isDragOver = dragOverFolderId === folder.id;
    const folderColor = folder.color || '#d97706';
    
    return (
      <div key={folder.id} data-testid={`sandbox-folder-${folder.id}`}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div 
              className={`flex items-center justify-between py-2 px-3 hover:bg-stone-800/40 rounded-lg cursor-pointer group transition-colors ${isDragOver ? 'bg-purple-900/30 ring-1 ring-purple-500/50' : ''}`}
              style={{ paddingLeft: `${depth * 16 + 12}px` }}
              onClick={() => toggleFolder(folder.id)}
              onDragOver={(e) => {
                if (isSandboxDrag(e)) {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOverFolderId(folder.id);
                }
              }}
              onDragLeave={(e) => { e.stopPropagation(); setDragOverFolderId(prev => prev === folder.id ? null : prev); }}
              onDrop={(e) => {
                handleItemDrop(folder.id, e);
                setExpandedFolders(prev => { const n = new Set(prev); n.add(folder.id); return n; });
              }}
            >
              <div className="flex items-center gap-2">
                <ChevronRight className={`h-3.5 w-3.5 text-stone-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                <FolderOpen className="h-4 w-4" style={{ color: folderColor }} />
                <span className="text-stone-300 text-sm font-medium">{folder.name}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => { e.stopPropagation(); deleteFolderMutation.mutate(folder.id); }}
                className="h-7 w-7 text-stone-500 hover:text-red-400 hover:bg-red-900/20"
                data-testid={`button-delete-folder-${folder.id}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Palette className="h-4 w-4 mr-2" />
                Folder Color
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-40">
                {folderColors.map((c) => (
                  <ContextMenuItem
                    key={c.name}
                    onClick={() => updateFolderMutation.mutate({ id: folder.id, data: { color: c.value } })}
                    data-testid={`folder-color-${c.name.toLowerCase()}-${folder.id}`}
                  >
                    <div className="h-4 w-4 rounded-full mr-2 border border-stone-600" style={{ backgroundColor: c.hex }} />
                    {c.name}
                    {(folder.color === c.value || (!folder.color && c.value === null)) && (
                      <span className="ml-auto text-amber-500">●</span>
                    )}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuItem
              className="text-red-400 focus:text-red-300 focus:bg-red-900/20"
              onClick={() => deleteFolderMutation.mutate(folder.id)}
              data-testid={`context-delete-folder-${folder.id}`}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Folder
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
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
        <Button
          size="sm"
          onClick={() => seedArcanaMutation.mutate()}
          disabled={seedArcanaMutation.isPending}
          className="w-full bg-amber-800 hover:bg-amber-700 text-amber-100 border border-amber-600/50"
          data-testid="button-seed-arcana"
        >
          {seedArcanaMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-1.5" />
          )}
          Load Arcana Adventure System
        </Button>

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
                Template
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

      <div
        className={`flex-1 overflow-y-auto space-y-1 custom-scrollbar ${dragOverFolderId === 'root' ? 'ring-1 ring-purple-500/30 rounded-lg' : ''}`}
        onDragOver={(e) => {
          if (isSandboxDrag(e)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDragOverFolderId(prev => prev !== null && prev !== 'root' ? prev : 'root');
          }
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragOverFolderId(null);
        }}
        onDrop={(e) => handleItemDrop(null, e)}
        data-testid="sandbox-root-drop-zone"
      >
        {rootFolders.map((f: any) => renderFolder(f))}
        {rootActors.map((a: any) => renderItem(a, 'actor'))}
        {rootTemplates.map((t: any) => renderItem(t, 'template'))}
        {rootFolders.length === 0 && rootActors.length === 0 && rootTemplates.length === 0 && (
          <div className="text-center py-12 text-stone-600 italic text-sm">
            No actors yet. Click Create to add one.
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
  zIndex = 45,
  onBringToFront,
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
  zIndex?: number;
  onBringToFront?: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const posRef = useRef(position);
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    posRef.current = position;
  }, [position]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    setIsDragging(true);
    setDragOffset({ x: e.clientX - posRef.current.x, y: e.clientY - posRef.current.y });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const newX = e.clientX - dragOffset.x;
    const newY = e.clientY - dragOffset.y;
    posRef.current = { x: newX, y: newY };
    if (divRef.current) {
      divRef.current.style.transform = `translate(${newX}px, ${newY}px)`;
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
    onPositionChange(posRef.current);
  };

  return (
    <div
      ref={divRef}
      className="fixed pointer-events-auto"
      style={{ left: 0, top: 0, transform: `translate(${position.x}px, ${position.y}px)`, width: `${size.width}px`, height: collapsed ? 'auto' : `${size.height}px`, zIndex, willChange: isDragging ? 'transform' : 'auto' }}
      data-testid="floating-notes-editor"
      onMouseDown={onBringToFront}
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
          <div className="flex-1 overflow-hidden min-h-0">
            <CampaignNotesPanel
              campaignId={campaignId}
              onClose={onClose}
              isOpen={true}
              campaignMembers={campaignMembers}
              onViewCharacter={onViewCharacter}
              initialNoteId={initialNoteId}
              hideCloseButton={true}
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
  
  // Click-to-place token state
  const [placingCharacterId, setPlacingCharacterId] = useState<string | null>(null);
  const [longPressedToken, setLongPressedToken] = useState<any>(null);
  const [showTokenVisionPanel, setShowTokenVisionPanel] = useState(false);
  
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

  interface SandboxHotbarSlot {
    type: 'roll' | 'sheet' | 'empty';
    actorId?: string;
    actorName?: string;
    propertyKey?: string;
    rollFormula?: string;
    buttonLabel?: string;
    buttonColor?: string;
    embeddedItemId?: string;
    embeddedItemName?: string;
    templateId?: string;
  }

  const SANDBOX_HOTBAR_SIZE = 8;

  const [sandboxHotbar, setSandboxHotbar] = useState<SandboxHotbarSlot[]>(() => {
    try {
      const key = `sandbox-hotbar-${campaignId}-${user?.id}`;
      const saved = localStorage.getItem(key);
      if (saved) return JSON.parse(saved);
    } catch {}
    return Array.from({ length: SANDBOX_HOTBAR_SIZE }, () => ({ type: 'empty' as const }));
  });

  const [sandboxHotbarVisible, setSandboxHotbarVisible] = useState(true);
  const [hotbarConfigSlot, setHotbarConfigSlot] = useState<number | null>(null);

  // Floating panel z-index management (bring to front on click)
  const floatingZCounterRef = useRef(50);
  const [floatingZIndices, setFloatingZIndices] = useState<Record<string, number>>({});
  const bringToFront = useCallback((panelKey: string) => {
    floatingZCounterRef.current += 1;
    setFloatingZIndices(prev => ({ ...prev, [panelKey]: floatingZCounterRef.current }));
  }, []);

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
  const [pendingSandboxAoe, setPendingSandboxAoe] = useState<{
    rollFormula: string;
    hitFormula?: string;
    damageFormula?: string;
    context: Record<string, any>;
    actorName: string;
    buttonLabel: string;
  } | null>(null);
  
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
  const [fogToolActive, setFogToolActive] = useState(false);

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

    if (isLocked && pendingSandboxAoe) {
      const gridSize = activeScene?.gridSize || 50;
      const tokensInAoe = getTokensInAoe(tokens, {
        ...aoeTargetState,
        center: { x, y },
        locked: true,
      }, gridSize, tokens.find((t: any) => t.id === aoeTargetState.casterTokenId));

      let damageText = '';
      if (pendingSandboxAoe.damageFormula) {
        const dmgResult = rollDice(pendingSandboxAoe.damageFormula, pendingSandboxAoe.context);
        damageText = ` | Damage: ${formatRollResult(dmgResult)}`;
      }

      const mainResult = rollDice(pendingSandboxAoe.rollFormula, pendingSandboxAoe.context);

      let resultMsg = `🎯 ${pendingSandboxAoe.buttonLabel}: ${formatRollResult(mainResult)}${damageText}`;

      if (tokensInAoe.length > 0) {
        resultMsg += `\n📍 Targets hit (${tokensInAoe.length}): ${tokensInAoe.map((t: any) => t.name || 'Token').join(', ')}`;

        if (pendingSandboxAoe.hitFormula) {
          const hitResults = tokensInAoe.map((t: any) => {
            const hitResult = rollDice(pendingSandboxAoe.hitFormula!, pendingSandboxAoe.context);
            return `${t.name || 'Token'}: ${formatRollResult(hitResult)}`;
          });
          resultMsg += `\n⚔️ Hit rolls: ${hitResults.join(' | ')}`;
        }
      } else {
        resultMsg += '\n📍 No targets in area';
      }

      gameWs.sendChatMessage('', pendingSandboxAoe.actorName, resultMsg, 'roll');
      setPendingSandboxAoe(null);
      exitAoeMode();
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
        let dp = campaignDefaultPanel || 'characters';
        if (!isSandbox && dp === 'characters') {
          dp = 'chat';
        }
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

  const { data: sandboxActorsForHotbar = [] } = useQuery({
    queryKey: ['sandbox-actors', effectiveCampaignId],
    queryFn: () => api.getSandboxActors(effectiveCampaignId!),
    enabled: !!effectiveCampaignId && !!isSandbox,
  });

  const sandboxTemplatesForHotbar = sandboxTemplatesList;

  const saveSandboxHotbar = useCallback((slots: SandboxHotbarSlot[]) => {
    setSandboxHotbar(slots);
    try {
      const key = `sandbox-hotbar-${effectiveCampaignId}-${user?.id}`;
      localStorage.setItem(key, JSON.stringify(slots));
    } catch {}
  }, [effectiveCampaignId, user?.id]);

  const handleSandboxHotbarAction = useCallback((slot: SandboxHotbarSlot) => {
    if (slot.type === 'sheet' && slot.actorId) {
      const actor = sandboxActorsForHotbar?.find((a: any) => a.id === slot.actorId);
      if (actor) {
        setOpenSandboxSheets(prev => {
          if (prev.find(s => s.id === actor.id)) return prev;
          return [...prev, { ...actor, type: 'actor' as const }];
        });
      }
      return;
    }

    if (slot.type === 'roll' && slot.rollFormula) {
      const actor = sandboxActorsForHotbar?.find((a: any) => a.id === slot.actorId);
      if (!actor) {
        toast({ title: 'Actor not found', variant: 'destructive' });
        return;
      }

      let actorData: any = {};
      try { actorData = JSON.parse(actor.data || '{}'); } catch {}
      const values = actorData.values || {};

      const template = sandboxTemplatesForHotbar?.find((t: any) => t.id === (slot.templateId || actor.templateId));
      let templateData: any = null;
      if (template) {
        try { templateData = migrateTemplateData(JSON.parse(template.data || '{}')); } catch {}
      }

      const context: Record<string, any> = {};
      if (templateData) {
        for (const [key, p] of Object.entries(templateData.properties as Record<string, any>)) {
          let val = values[key];
          if (p.metadata?.calculationExpression) {
            const propDefs: Record<string, { type: string; defaultValue?: any }> = {};
            for (const [k, pd] of Object.entries(templateData.properties as Record<string, any>)) {
              propDefs[k] = { type: pd.type, defaultValue: pd.defaultValue };
            }
            const calcResult = evaluateExpression(p.metadata.calculationExpression, { values, properties: propDefs });
            if (!calcResult.error) val = String(calcResult.value);
          }
          if (p.type === 'resource') {
            try { context[key] = JSON.parse(val as string || '{}'); } catch { context[key] = 0; }
          } else if (p.type === 'number') {
            context[key] = Number(val) || 0;
          } else {
            context[key] = val || '';
          }
        }
      }

      if (slot.embeddedItemId && actorData.embeddedItems) {
        const embItem = actorData.embeddedItems.find((ei: any) => ei.id === slot.embeddedItemId);
        if (embItem) {
          const embTemplate = sandboxTemplatesForHotbar?.find((t: any) => t.id === embItem.templateId);
          if (embTemplate) {
            try {
              const embTemplateData = migrateTemplateData(JSON.parse(embTemplate.data || '{}'));
              for (const [key, p] of Object.entries(embTemplateData.properties as Record<string, any>)) {
                let val = embItem.values[key] ?? p.defaultValue;
                if (val === undefined) continue;
                if (p.type === 'number') context[key] = Number(val) || 0;
                else context[key] = val;
              }
            } catch {}
          }
        }
      }

      const result = rollDice(slot.rollFormula, context);
      const rollText = formatRollResult(result);
      const label = slot.embeddedItemName
        ? `${slot.embeddedItemName}: ${slot.buttonLabel || 'Roll'}`
        : (slot.buttonLabel || 'Roll');
      gameWs.sendChatMessage('', slot.actorName || 'Actor', `🎲 ${label}: ${rollText}`, 'roll');
      toast({ title: `${label}: ${result.total}`, description: rollText });
    }
  }, [sandboxActorsForHotbar, sandboxTemplatesForHotbar, toast]);

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
        if (data.type === 'wall_created' || data.type === 'walls_batch_created' || data.type === 'walls_cleared') {
          queryClientRef.current.invalidateQueries({ queryKey: ['scene-walls'] });
        }
        if (data.type === 'door_created' || data.type === 'door_toggled') {
          queryClientRef.current.invalidateQueries({ queryKey: ['scene-doors'] });
        }
        if (data.type === 'window_created') {
          queryClientRef.current.invalidateQueries({ queryKey: ['scene-windows'] });
        }
        if (data.type === 'light_created') {
          queryClientRef.current.invalidateQueries({ queryKey: ['scene-lights'] });
        }
        if (data.type === 'fog_state_updated' && data.sceneId) {
          queryClientRef.current.invalidateQueries({ queryKey: [`/api/scenes/${data.sceneId}`] });
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
          // Players need edit access to open character sheet
          const permission = myPermissions?.permissions?.[charData.id];
          const isOwner = charData.userId === user?.id;
          if (isOwner || permission === 'owner' || permission === 'edit') {
            setCharacterSheetDefaultTab("overview");
            openCharacterSheet(charData);
          } else {
            toast({ title: "No Access", description: "You don't have edit access to this character", variant: "destructive" });
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

  const handleDropCharacterOnMap = useCallback((characterId: string, gridX: number, gridY: number) => {
    const character = characters?.find((c: any) => c.id.toString() === characterId);
    if (!character) return;
    
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
      x: gridX,
      y: gridY,
      image: tokenImage,
    };
    createTokenMutation.mutate(newToken);
  }, [characters, systemSpecies, createTokenMutation]);

  const handleMapClickToPlace = useCallback((gridX: number, gridY: number) => {
    if (!placingCharacterId) return;
    handleDropCharacterOnMap(placingCharacterId, gridX, gridY);
    setPlacingCharacterId(null);
  }, [placingCharacterId, handleDropCharacterOnMap]);

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
                <p>{isSandbox ? 'Actors' : 'Characters'}</p>
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

          {role === 'gm' && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setFogToolActive(!fogToolActive)}
                    className={`text-white/50 hover:text-white hover:bg-white/10 pointer-events-auto ${fogToolActive ? 'text-cyan-400 bg-white/10' : ''}`}
                    data-testid="button-fog-of-war"
                  >
                    <Layers className="h-5 w-5" style={{ filter: 'drop-shadow(0 0 2px black) drop-shadow(0 0 2px black) drop-shadow(0 0 1px black)' }} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="bg-stone-800 border-stone-700 text-stone-200">
                  <p>Fog of War</p>
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
          zIndex={floatingZIndices[`sandbox-${sheet.id}`] || 45}
          onBringToFront={() => bringToFront(`sandbox-${sheet.id}`)}
          enterAoeMode={enterAoeMode}
          tokens={tokens}
          activeScene={activeScene}
          setPendingSandboxAoe={setPendingSandboxAoe}
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
          zIndex={floatingZIndices['notes'] || 45}
          onBringToFront={() => bringToFront('notes')}
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

      {placingCharacterId && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[60] bg-amber-900/90 border border-amber-600 rounded-lg px-4 py-2 text-amber-200 text-sm flex items-center gap-3 shadow-xl backdrop-blur-sm">
          <span>Click on the map to place token</span>
          <button onClick={() => setPlacingCharacterId(null)} className="text-amber-400 hover:text-amber-200">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Game View - Always visible for all campaign members */}
      <div 
        className="flex flex-col h-full w-full"
      >
        
        {/* Map Area - Takes full space, but HUD overlays it */}
        <div ref={battlemapContainerRef} className="relative flex-grow w-full bg-stone-900 z-0 overflow-hidden" style={{ contain: 'layout paint style', isolation: 'isolate' }}
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
             fogToolActive={fogToolActive}
             onFogToolActiveChange={setFogToolActive}
             onDropCharacterOnMap={handleDropCharacterOnMap}
             onMapClickToPlace={handleMapClickToPlace}
             placingCharacterId={placingCharacterId}
             currentUserId={user?.id || null}
             assignedCharacterId={character?.id || null}
             onTokenLongPress={setLongPressedToken}
           />
           
           {/* Battlemap Dice Overlay for 3D dice rolling */}
           <BattlemapDiceOverlay />
           
           <SelectionModeButtons
             selectionMode={selectionMode}
             onModeChange={handleModeChange}
             character={role === 'gm' ? inspectedChar : character}
             tokens={tokens}
             onEnterSpellTargeting={(spell, casterTokenId) => enterAoeMode(spell, casterTokenId)}
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
           
           {!isSandbox && (() => {
             const sheetChar = role === 'gm' 
               ? (inspectedChar || (character?.id ? character : null) || (characters as any[] || []).find((c: any) => c.id)) 
               : character;
             if (!sheetChar?.id) return null;
             return (
               <div className="absolute bottom-[105px] md:bottom-[120px] right-4 z-[60] pointer-events-auto" data-testid="btn-character-overview">
                 <button
                   className="flex items-center gap-2 px-3 py-2 rounded-lg bg-stone-800/95 border border-stone-600 hover:border-amber-500 hover:bg-stone-700 text-stone-200 hover:text-amber-400 transition-all shadow-lg backdrop-blur-sm"
                   onClick={() => {
                     setCharacterSheetDefaultTab("overview");
                     openCharacterSheet(sheetChar);
                   }}
                   title={`Open ${sheetChar.name || 'Character'} Sheet`}
                   data-testid="button-character-overview"
                 >
                   {sheetChar.portrait ? (
                     <img src={sheetChar.portrait} alt="" className="w-7 h-7 rounded-full object-cover border border-stone-500" />
                   ) : (
                     <div className="w-7 h-7 rounded-full bg-amber-900/50 border border-amber-700/50 flex items-center justify-center">
                       <User className="h-4 w-4 text-amber-400" />
                     </div>
                   )}
                   <span className="text-sm font-medium max-w-[120px] truncate">{sheetChar.name || 'Character'}</span>
                   <ScrollText className="h-4 w-4 text-stone-400" />
                 </button>
               </div>
             );
           })()}

           {!isSandbox && (role === 'gm' ? (inspectedChar || (character?.id ? character : null)) : character) && (
             <BattleMapHotbars 
               character={role === 'gm' ? (inspectedChar || (character?.id ? character : null)) : character}
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
                bringToFront={bringToFront}
                floatingZIndices={floatingZIndices}
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
            zIndex={floatingZIndices[`char-${sheet.id}`] || (40 + index)}
            onBringToFront={() => bringToFront(`char-${sheet.id}`)}
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
              bringToFront={bringToFront}
              floatingZIndices={floatingZIndices}
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
                {activeSidePanel === 'characters' && (isSandbox ? 'Actors' : 'Characters')}
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
                  members={members as any[]}
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
                    <div className="h-full overflow-y-auto">
                      <CampaignMenu 
                        campaignId={effectiveCampaignId}
                        role={role} 
                        inviteCode=""
                        hotbarSlots={(campaign && typeof campaign === 'object' && 'hotbarSlots' in campaign ? (campaign as any).hotbarSlots as number : 5) || 5}
                        inspectedChar={inspectedChar}
                        onInspectChar={setInspectedChar}
                        onAddCharacterToken={handleAddCharacterToken}
                        onPlaceCharacterToken={(charId: string) => setPlacingCharacterId(charId)}
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
                        charactersOnly={true}
                      />
                    </div>
                  )}
                </div>
              )}
              {activeSidePanel === 'notes' && effectiveCampaignId && (
                <div className="h-full overflow-y-auto p-3">
                  <NotesFolderBrowser
                    campaignId={effectiveCampaignId}
                    onSelectNote={(noteId) => {
                      if (isMobile) {
                        setLocation(`/notes/${noteId}`);
                      } else {
                        setFloatingNotesInitialNoteId(noteId);
                        setFloatingNotesOpen(true);
                      }
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
                    onPlaceCharacterToken={(charId: string) => setPlacingCharacterId(charId)}
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
                      <>
                        <SceneSettingsForm
                          scene={activeScene}
                          onUpdateScene={handleUpdateScene}
                        />
                        <div className="pt-4">
                          <Button
                            onClick={handleSetDefaultView}
                            className="w-full bg-blue-900/80 hover:bg-blue-800 text-white border border-blue-700"
                            data-testid="button-set-default-view-desktop"
                          >
                            <MapIcon className="h-4 w-4 mr-2" />
                            Set Default View
                          </Button>
                        </div>
                      </>
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
      
      {/* Sandbox Player Hotbar */}
      {isSandbox && sandboxHotbarVisible && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-1 bg-stone-900/95 border border-stone-700/60 rounded-xl px-2 py-1.5 backdrop-blur-sm shadow-xl"
          data-testid="sandbox-hotbar">
          {sandboxHotbar.map((slot, idx) => (
            <div key={idx} className="relative">
              {slot.type === 'empty' ? (
                <button
                  className="w-12 h-12 rounded-lg bg-stone-800/60 border border-stone-700/40 border-dashed flex items-center justify-center text-stone-600 hover:text-stone-400 hover:border-stone-500 transition-colors"
                  onClick={() => setHotbarConfigSlot(idx)}
                  data-testid={`hotbar-slot-empty-${idx}`}
                >
                  <Plus className="h-4 w-4" />
                </button>
              ) : slot.type === 'roll' ? (
                <button
                  className="w-12 h-12 rounded-lg border border-stone-600/50 flex flex-col items-center justify-center gap-0.5 hover:brightness-110 transition-all active:scale-95"
                  style={{ backgroundColor: slot.buttonColor || '#d97706' }}
                  onClick={() => handleSandboxHotbarAction(slot)}
                  onContextMenu={(e) => { e.preventDefault(); const newSlots = [...sandboxHotbar]; newSlots[idx] = { type: 'empty' }; saveSandboxHotbar(newSlots); }}
                  title={`${slot.actorName}: ${slot.buttonLabel || 'Roll'}`}
                  data-testid={`hotbar-slot-roll-${idx}`}
                >
                  <Dices className="h-4 w-4 text-white/90" />
                  <span className="text-[9px] text-white/80 font-medium leading-none truncate max-w-[40px]">{slot.buttonLabel || 'Roll'}</span>
                </button>
              ) : slot.type === 'sheet' ? (
                <button
                  className="w-12 h-12 rounded-lg bg-stone-800 border border-stone-600/50 flex flex-col items-center justify-center gap-0.5 hover:bg-stone-700 transition-colors active:scale-95"
                  onClick={() => handleSandboxHotbarAction(slot)}
                  onContextMenu={(e) => { e.preventDefault(); const newSlots = [...sandboxHotbar]; newSlots[idx] = { type: 'empty' }; saveSandboxHotbar(newSlots); }}
                  title={slot.actorName || 'Sheet'}
                  data-testid={`hotbar-slot-sheet-${idx}`}
                >
                  <User className="h-4 w-4 text-amber-400" />
                  <span className="text-[9px] text-stone-300 font-medium leading-none truncate max-w-[40px]">{slot.actorName || 'Sheet'}</span>
                </button>
              ) : null}
            </div>
          ))}
          <button
            className="ml-1 w-6 h-12 rounded-lg bg-stone-800/60 border border-stone-700/40 flex items-center justify-center text-stone-500 hover:text-stone-300 transition-colors"
            onClick={() => setSandboxHotbarVisible(false)}
            data-testid="hotbar-hide-button"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
      )}

      {isSandbox && !sandboxHotbarVisible && (
        <button
          className="fixed bottom-2 left-1/2 -translate-x-1/2 z-[60] px-3 py-1 bg-stone-900/80 border border-stone-700/40 rounded-full text-stone-400 text-xs hover:text-stone-200 transition-colors backdrop-blur-sm"
          onClick={() => setSandboxHotbarVisible(true)}
          data-testid="hotbar-show-button"
        >
          Hotbar
        </button>
      )}

      {/* Hotbar Configuration Dialog */}
      {hotbarConfigSlot !== null && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={() => setHotbarConfigSlot(null)}>
          <div className="bg-stone-900 border border-stone-700 rounded-xl p-4 w-80 max-h-96 overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-medium text-stone-200 mb-3">Configure Hotbar Slot</h3>
            <div className="space-y-3">
              <div className="text-xs text-stone-400 font-medium">Actor Sheets</div>
              {(sandboxActorsForHotbar || []).map((actor: any) => (
                <button key={actor.id}
                  className="w-full text-left px-3 py-2 rounded-lg bg-stone-800/60 hover:bg-stone-800 border border-stone-700/40 transition-colors"
                  onClick={() => {
                    const newSlots = [...sandboxHotbar];
                    newSlots[hotbarConfigSlot] = { type: 'sheet', actorId: actor.id, actorName: actor.name };
                    saveSandboxHotbar(newSlots);
                    setHotbarConfigSlot(null);
                  }}
                  data-testid={`hotbar-add-sheet-${actor.id}`}
                >
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-amber-400" />
                    <span className="text-xs text-stone-200">{actor.name}</span>
                  </div>
                </button>
              ))}
              <div className="text-xs text-stone-400 font-medium mt-3">Roll Buttons</div>
              {(sandboxActorsForHotbar || []).map((actor: any) => {
                let actorData: any = {};
                try { actorData = JSON.parse(actor.data || '{}'); } catch {}
                const template = (sandboxTemplatesForHotbar || []).find((t: any) => t.id === actor.templateId);
                if (!template) return null;
                let tData: any = null;
                try { tData = migrateTemplateData(JSON.parse(template.data || '{}')); } catch {}
                if (!tData) return null;
                const buttonProps = Object.values(tData.properties || {}).filter((p: any) => p.type === 'button' && p.metadata?.buttonConfig?.rollFormula);
                const embeddedButtons: any[] = [];
                if (actorData.embeddedItems) {
                  for (const embItem of actorData.embeddedItems) {
                    const embTemplate = (sandboxTemplatesForHotbar || []).find((t: any) => t.id === embItem.templateId);
                    if (!embTemplate) continue;
                    let embTData: any = null;
                    try { embTData = migrateTemplateData(JSON.parse(embTemplate.data || '{}')); } catch {}
                    if (!embTData) continue;
                    const embBtns = Object.values(embTData.properties || {}).filter((p: any) => p.type === 'button' && p.metadata?.buttonConfig?.rollFormula);
                    for (const btn of embBtns) {
                      embeddedButtons.push({ ...btn as any, embeddedItemId: embItem.id, embeddedItemName: embItem.name, embItemTemplateId: embItem.templateId });
                    }
                  }
                }
                if (buttonProps.length === 0 && embeddedButtons.length === 0) return null;
                return (
                  <div key={actor.id} className="space-y-1">
                    <div className="text-xs text-stone-500 pl-1">{actor.name}</div>
                    {buttonProps.map((bp: any) => (
                      <button key={bp.key}
                        className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-stone-800 border border-stone-700/30 transition-colors flex items-center gap-2"
                        onClick={() => {
                          const newSlots = [...sandboxHotbar];
                          newSlots[hotbarConfigSlot!] = {
                            type: 'roll',
                            actorId: actor.id,
                            actorName: actor.name,
                            propertyKey: bp.key,
                            rollFormula: bp.metadata?.buttonConfig?.rollFormula || '',
                            buttonLabel: bp.metadata?.buttonConfig?.label || bp.metadata?.label || bp.key,
                            buttonColor: bp.metadata?.buttonConfig?.color || '#d97706',
                            templateId: actor.templateId,
                          };
                          saveSandboxHotbar(newSlots);
                          setHotbarConfigSlot(null);
                        }}
                        data-testid={`hotbar-add-roll-${actor.id}-${bp.key}`}
                      >
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: bp.metadata?.buttonConfig?.color || '#d97706' }} />
                        <span className="text-xs text-stone-300">{bp.metadata?.buttonConfig?.label || bp.metadata?.label || bp.key}</span>
                      </button>
                    ))}
                    {embeddedButtons.map((eb: any) => (
                      <button key={`${eb.embeddedItemId}-${eb.key}`}
                        className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-stone-800 border border-stone-700/30 transition-colors flex items-center gap-2"
                        onClick={() => {
                          const newSlots = [...sandboxHotbar];
                          newSlots[hotbarConfigSlot!] = {
                            type: 'roll',
                            actorId: actor.id,
                            actorName: actor.name,
                            propertyKey: eb.key,
                            rollFormula: eb.metadata?.buttonConfig?.rollFormula || '',
                            buttonLabel: eb.metadata?.buttonConfig?.label || eb.metadata?.label || eb.key,
                            buttonColor: eb.metadata?.buttonConfig?.color || '#d97706',
                            embeddedItemId: eb.embeddedItemId,
                            embeddedItemName: eb.embeddedItemName,
                            templateId: actor.templateId,
                          };
                          saveSandboxHotbar(newSlots);
                          setHotbarConfigSlot(null);
                        }}
                        data-testid={`hotbar-add-embroll-${eb.embeddedItemId}-${eb.key}`}
                      >
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: eb.metadata?.buttonConfig?.color || '#d97706' }} />
                        <span className="text-xs text-stone-300">{eb.embeddedItemName}: {eb.metadata?.buttonConfig?.label || eb.key}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
            <button className="mt-3 w-full py-1.5 text-xs text-stone-500 hover:text-stone-300 transition-colors" onClick={() => setHotbarConfigSlot(null)} data-testid="hotbar-config-cancel">Cancel</button>
          </div>
        </div>
      )}

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

      {longPressedToken && (() => {
        const tokenChar = characters?.find((c: any) => c.id === longPressedToken.characterId);
        if (!tokenChar) return null;
        
        return (
          <div className="fixed top-4 left-4 z-[70] bg-stone-900/95 border border-stone-700 rounded-lg p-3 w-64 shadow-xl backdrop-blur-sm" data-testid="token-fog-settings">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-cyan-400" />
                <span className="text-sm font-bold text-stone-200">{tokenChar.name} Vision</span>
              </div>
              <button onClick={() => { setLongPressedToken(null); }} className="text-stone-500 hover:text-stone-300">
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="space-y-2">
              <div>
                <Label className="text-[10px] text-stone-500">Vision Type</Label>
                <select
                  defaultValue={tokenChar.visionType || 'normal'}
                  onChange={(e) => {
                    handleUpdateCharacterById(tokenChar.id, { visionType: e.target.value });
                  }}
                  className="w-full h-7 px-2 text-xs rounded-md border border-stone-700 bg-stone-800 text-stone-200"
                  data-testid="select-token-vision-type"
                >
                  <option value="normal">Normal</option>
                  <option value="darkvision">Darkvision</option>
                  <option value="blindsight">Blindsight</option>
                  <option value="truesight">Truesight</option>
                  <option value="tremorsense">Tremorsense</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-stone-500">Day Vision (ft)</Label>
                  <Input
                    type="number"
                    defaultValue={tokenChar.dayVisionDistance || 120}
                    onBlur={(e) => {
                      handleUpdateCharacterById(tokenChar.id, { dayVisionDistance: parseInt(e.target.value) || 120 });
                    }}
                    className="h-7 text-xs bg-stone-800 border-stone-700 text-stone-200"
                    data-testid="input-token-day-vision"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-stone-500">Night Vision (ft)</Label>
                  <Input
                    type="number"
                    defaultValue={tokenChar.nightVisionDistance || 60}
                    onBlur={(e) => {
                      handleUpdateCharacterById(tokenChar.id, { nightVisionDistance: parseInt(e.target.value) || 60 });
                    }}
                    className="h-7 text-xs bg-stone-800 border-stone-700 text-stone-200"
                    data-testid="input-token-night-vision"
                  />
                </div>
              </div>
              <span className="text-[10px] text-stone-500 italic">Each grid square = 5ft</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}