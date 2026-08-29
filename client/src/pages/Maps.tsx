import React, { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, Plus, Map as MapIcon, Trash2, Wand2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type GameMap } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { LoadingLogo } from "@/components/LoadingLogo";
import { StampAssetManager } from "@/components/mapmaker/StampAssetManager";
import bgImage from "@assets/generated_images/dark_fantasy_landscape_with_arcane_ruins.png";

export default function Maps() {
  const [, setLocation] = useLocation();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<GameMap | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);

  const { data: maps = [], isLoading } = useQuery<GameMap[]>({
    queryKey: ['/api/maps'],
    queryFn: () => api.getMaps(),
  });

  const createMutation = useMutation({
    mutationFn: () => api.createMap({}),
    onSuccess: (map) => {
      queryClient.invalidateQueries({ queryKey: ['/api/maps'] });
      setLocation(`/maps/${map.id}`);
    },
    onError: () => toast({ title: "Couldn't create map", variant: "destructive" }),
  });

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
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              data-testid="button-new-map"
            >
              {createMutation.isPending ? <LoadingLogo className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              New Map
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-stone-500">
            <LoadingLogo className="h-6 w-6 mr-2" /> Loading maps...
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
    </div>
  );
}
