import React, { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, Map as MapIcon, Trash2, Wand2, Globe, Swords } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type GameMap } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { LoadingLogo } from "@/components/LoadingLogo";
import { StampAssetManager } from "@/components/mapmaker/StampAssetManager";
import bgImage from "@assets/generated_images/dark_fantasy_landscape_with_arcane_ruins.png";

const REGIONAL_SIZE_PRESETS = [
  { label: "Small (Local Area)", width: 1500, height: 1100 },
  { label: "Medium (Kingdom)", width: 2500, height: 1800 },
  { label: "Large (Region)", width: 3500, height: 2500 },
  { label: "Huge (Continent)", width: 5000, height: 3600 },
];

const BATTLE_SIZE_PRESETS = [
  { label: "Small (Room / Skirmish)", width: 900, height: 700 },
  { label: "Medium (Dungeon Level)", width: 1500, height: 1100 },
  { label: "Large (Encounter Site)", width: 2200, height: 1600 },
  { label: "Huge (Multi-Room Complex)", width: 3200, height: 2200 },
];

export default function Maps() {
  const [, setLocation] = useLocation();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<GameMap | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [newMapOpen, setNewMapOpen] = useState(false);
  const [newMapName, setNewMapName] = useState("");
  const [newMapType, setNewMapType] = useState<'regional' | 'battle'>('regional');
  const [presetIndex, setPresetIndex] = useState(1);
  const [customWidth, setCustomWidth] = useState(2000);
  const [customHeight, setCustomHeight] = useState(1500);
  const [useCustomSize, setUseCustomSize] = useState(false);
  const sizePresets = newMapType === 'battle' ? BATTLE_SIZE_PRESETS : REGIONAL_SIZE_PRESETS;

  const { data: maps = [], isLoading, isError, refetch } = useQuery<GameMap[]>({
    queryKey: ['/api/maps'],
    queryFn: () => api.getMaps(),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; width: number; height: number; mapType: string; gridSize?: number }) => api.createMap(data),
    onSuccess: (map) => {
      queryClient.invalidateQueries({ queryKey: ['/api/maps'] });
      setNewMapOpen(false);
      setLocation(`/maps/${map.id}`);
    },
    onError: () => toast({ title: "Couldn't create map", variant: "destructive" }),
  });

  const openNewMapDialog = () => {
    setNewMapName("");
    setNewMapType('regional');
    setPresetIndex(1);
    setUseCustomSize(false);
    setNewMapOpen(true);
  };

  const handleCreateMap = () => {
    const { width, height } = useCustomSize
      ? { width: Math.max(200, Math.min(8000, customWidth || 2000)), height: Math.max(200, Math.min(8000, customHeight || 1500)) }
      : sizePresets[presetIndex];
    createMutation.mutate({
      name: newMapName.trim() || "Untitled Map",
      width, height,
      mapType: newMapType,
      gridSize: newMapType === 'battle' ? 50 : undefined,
    });
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteMap(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/maps'] });
      setDeleteTarget(null);
    },
    onError: () => toast({ title: "Couldn't delete map", variant: "destructive" }),
  });

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black font-sans text-stone-100">
      <div className="absolute inset-0 z-0">
        <img src={bgImage} alt="" className="h-full w-full object-cover opacity-40 blur-sm" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/50 to-black/80" />
      </div>

      <div className="relative z-10 w-full p-6">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="text-stone-400 hover:text-white hover:bg-white/10">
              <ArrowLeft />
            </Button>
            <h1 className="font-display text-4xl font-bold text-amber-500">Maps</h1>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button
                variant="outline"
                className="border-stone-700 text-stone-300 hover:bg-stone-800"
                onClick={() => setManagerOpen(true)}
                data-testid="button-manage-stamp-assets"
              >
                <Wand2 className="h-4 w-4 mr-2" /> Stamp Assets
              </Button>
            )}
            <Button
              className="bg-amber-700 hover:bg-amber-600 text-white font-bold shadow-lg shadow-amber-900/20"
              onClick={openNewMapDialog}
              data-testid="button-new-map"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Map
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-stone-500">
            <LoadingLogo className="h-6 w-6 mr-2" /> Loading maps...
          </div>
        ) : isError ? (
          <div className="w-full p-10 rounded border border-dashed border-red-900/50 bg-stone-950/30 text-center text-stone-400">
            <p className="text-red-400 mb-2">Couldn't load your maps.</p>
            <Button variant="outline" className="border-stone-700" onClick={() => refetch()} data-testid="button-retry-load-maps">Try Again</Button>
          </div>
        ) : maps.length === 0 ? (
          <div className="w-full p-10 rounded border border-dashed border-stone-800 bg-stone-950/30 text-center text-stone-500">
            No maps yet. Create one to start painting terrain and placing stamps.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {maps.map((map) => (
              <Card
                key={map.id}
                className="bg-stone-900/60 border-stone-800 backdrop-blur transition-all group hover:border-amber-900/50 cursor-pointer overflow-hidden"
                onClick={() => setLocation(`/maps/${map.id}`)}
                data-testid={`card-map-${map.id}`}
              >
                <div className="h-32 bg-stone-950 flex items-center justify-center overflow-hidden">
                  {map.thumbnail || map.terrainImage ? (
                    <img src={map.thumbnail || map.terrainImage || ''} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <MapIcon className="h-10 w-10 text-stone-700" />
                  )}
                </div>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-stone-500 mb-0.5">
                    {map.mapType === 'battle' ? <Swords className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                    {map.mapType === 'battle' ? 'Battle Map' : 'World Map'}
                  </div>
                  <CardTitle className="flex justify-between items-start text-base text-stone-200 font-display">
                    <span className="truncate" data-testid={`text-map-name-${map.id}`}>{map.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-stone-600 hover:text-red-400 hover:bg-stone-800 shrink-0"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(map); }}
                      data-testid={`button-delete-map-${map.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-stone-500">
                  {map.width} × {map.height} · grid {map.gridSize}px
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-stone-900 border-stone-800">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This can't be undone. Scenes already imported from this map are unaffected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-900 hover:bg-red-800"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isAdmin && <StampAssetManager open={managerOpen} onOpenChange={setManagerOpen} />}

      <Dialog open={newMapOpen} onOpenChange={setNewMapOpen}>
        <DialogContent className="bg-stone-900 border-stone-700 max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-stone-200">New Map</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-stone-400 mb-1 block">Name</Label>
              <Input
                value={newMapName}
                onChange={(e) => setNewMapName(e.target.value)}
                placeholder="Untitled Map"
                className="bg-stone-800 border-stone-700"
                autoFocus
                data-testid="input-new-map-name"
              />
            </div>
            <div>
              <Label className="text-xs text-stone-400 mb-1 block">Type</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { setNewMapType('regional'); setPresetIndex(1); }}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded border ${newMapType === 'regional' ? 'bg-amber-900/30 border-amber-700 text-amber-200' : 'bg-stone-800 border-stone-700 text-stone-300 hover:bg-stone-700'}`}
                  data-testid="button-map-type-regional"
                >
                  <Globe className="h-5 w-5" />
                  <span className="text-sm font-medium">World Map</span>
                  <span className="text-[10px] text-stone-500">Regions, continents, overland travel</span>
                </button>
                <button
                  onClick={() => { setNewMapType('battle'); setPresetIndex(1); }}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded border ${newMapType === 'battle' ? 'bg-amber-900/30 border-amber-700 text-amber-200' : 'bg-stone-800 border-stone-700 text-stone-300 hover:bg-stone-700'}`}
                  data-testid="button-map-type-battle"
                >
                  <Swords className="h-5 w-5" />
                  <span className="text-sm font-medium">Battle Map</span>
                  <span className="text-[10px] text-stone-500">Tactical scale, grid on by default</span>
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs text-stone-400 mb-1 block">Size</Label>
              <div className="space-y-1">
                {sizePresets.map((p, i) => (
                  <button
                    key={p.label}
                    onClick={() => { setPresetIndex(i); setUseCustomSize(false); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded text-sm border ${!useCustomSize && presetIndex === i ? 'bg-amber-900/30 text-amber-200 border-amber-700' : 'bg-stone-800 text-stone-300 border-stone-700 hover:bg-stone-700'}`}
                    data-testid={`button-map-size-preset-${i}`}
                  >
                    {p.label} <span className="text-stone-500">({p.width}×{p.height})</span>
                  </button>
                ))}
                <button
                  onClick={() => setUseCustomSize(true)}
                  className={`w-full text-left px-2.5 py-1.5 rounded text-sm border ${useCustomSize ? 'bg-amber-900/30 text-amber-200 border-amber-700' : 'bg-stone-800 text-stone-300 border-stone-700 hover:bg-stone-700'}`}
                  data-testid="button-map-size-custom"
                >
                  Custom
                </button>
                {useCustomSize && (
                  <div className="flex items-center gap-2 pt-1">
                    <Input
                      type="number" min={200} max={8000}
                      value={customWidth}
                      onChange={(e) => setCustomWidth(Number(e.target.value))}
                      className="bg-stone-800 border-stone-700 h-8"
                      data-testid="input-map-width"
                    />
                    <span className="text-stone-500 text-sm">×</span>
                    <Input
                      type="number" min={200} max={8000}
                      value={customHeight}
                      onChange={(e) => setCustomHeight(Number(e.target.value))}
                      className="bg-stone-800 border-stone-700 h-8"
                      data-testid="input-map-height"
                    />
                  </div>
                )}
              </div>
            </div>
            <Button
              className="w-full bg-amber-700 hover:bg-amber-600"
              onClick={handleCreateMap}
              disabled={createMutation.isPending}
              data-testid="button-confirm-new-map"
            >
              {createMutation.isPending ? <LoadingLogo className="h-4 w-4 mr-2" /> : null} Create Map
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
