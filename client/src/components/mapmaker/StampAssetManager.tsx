// Admin-only stamp asset library. A "stamp asset" is a logical placeable
// (e.g. "Carriage") with one or more image variants (e.g. "Normal", "On
// Fire") — see shared/schema.ts's maps/stampAssets/stampAssetVariants
// comments for how a map's activeVariantIndex uses these variants to swap
// every placed instance's look at once without touching position/size.
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Upload, Pencil, Check, X } from "lucide-react";
import { api, type StampAsset } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { LoadingLogo } from "@/components/LoadingLogo";

interface StampAssetManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StampAssetManager({ open, onOpenChange }: StampAssetManagerProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("misc");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  const { data: assets = [], isLoading } = useQuery<StampAsset[]>({
    queryKey: ['/api/stamp-assets'],
    queryFn: () => api.getStampAssets(),
    enabled: open,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['/api/stamp-assets'] });

  const createAssetMutation = useMutation({
    mutationFn: () => api.createStampAsset({ name: newName.trim() || "New Stamp", category: newCategory.trim() || "misc" }),
    onSuccess: () => { invalidate(); setNewName(""); },
    onError: () => toast({ title: "Couldn't create stamp asset", variant: "destructive" }),
  });

  const renameAssetMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.updateStampAsset(id, { name }),
    onSuccess: () => { invalidate(); setRenamingId(null); },
  });

  const deleteAssetMutation = useMutation({
    mutationFn: (id: string) => api.deleteStampAsset(id),
    onSuccess: invalidate,
  });

  const addVariantMutation = useMutation({
    mutationFn: ({ stampAssetId, label, image, sortOrder }: { stampAssetId: string; label: string; image: string; sortOrder: number }) =>
      api.createStampAssetVariant(stampAssetId, { label, image, sortOrder }),
    onSuccess: invalidate,
    onError: () => toast({ title: "Couldn't upload variant", variant: "destructive" }),
  });

  const deleteVariantMutation = useMutation({
    mutationFn: (id: string) => api.deleteStampAssetVariant(id),
    onSuccess: invalidate,
  });

  const handleVariantFile = (asset: StampAsset, file: File) => {
    setUploadingFor(asset.id);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      try {
        const { url } = await api.uploadBase64Image(dataUrl);
        const label = asset.variants.length === 0 ? "Normal" : `Variant ${asset.variants.length + 1}`;
        await addVariantMutation.mutateAsync({ stampAssetId: asset.id, label, image: url, sortOrder: asset.variants.length });
      } finally {
        setUploadingFor(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const grouped = assets.reduce<Record<string, StampAsset[]>>((acc, a) => {
    (acc[a.category] ||= []).push(a);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-stone-200">Stamp Assets</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 pb-3 border-b border-stone-800">
          <Input
            placeholder="New stamp name (e.g. Carriage)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="bg-stone-800 border-stone-700"
            data-testid="input-new-stamp-name"
          />
          <Input
            placeholder="Category"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="bg-stone-800 border-stone-700 w-32"
            data-testid="input-new-stamp-category"
          />
          <Button
            onClick={() => createAssetMutation.mutate()}
            disabled={createAssetMutation.isPending}
            className="bg-amber-700 hover:bg-amber-600 shrink-0"
            data-testid="button-create-stamp-asset"
          >
            {createAssetMutation.isPending ? <LoadingLogo className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-stone-500"><LoadingLogo className="h-5 w-5" /></div>
          ) : assets.length === 0 ? (
            <p className="text-sm text-stone-500 text-center py-6">No stamp assets yet — add one above.</p>
          ) : (
            Object.entries(grouped).map(([category, list]) => (
              <div key={category}>
                <p className="text-xs uppercase tracking-wide text-stone-500 mb-1.5">{category}</p>
                <div className="space-y-2">
                  {list.map((asset) => (
                    <div key={asset.id} className="rounded-lg border border-stone-700 bg-stone-800/50 p-2.5" data-testid={`stamp-asset-${asset.id}`}>
                      <div className="flex items-center gap-2 mb-2">
                        {renamingId === asset.id ? (
                          <>
                            <Input
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              className="h-7 bg-stone-900 border-stone-700 text-sm flex-1"
                              autoFocus
                            />
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-400"
                              onClick={() => renameAssetMutation.mutate({ id: asset.id, name: renameDraft.trim() || asset.name })}>
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-stone-400" onClick={() => setRenamingId(null)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <span className="text-sm text-stone-200 flex-1 truncate" data-testid={`text-stamp-name-${asset.id}`}>{asset.name}</span>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-stone-400 hover:text-stone-200"
                              onClick={() => { setRenamingId(asset.id); setRenameDraft(asset.name); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-stone-500 hover:text-red-400"
                              onClick={() => deleteAssetMutation.mutate(asset.id)} data-testid={`button-delete-stamp-${asset.id}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {asset.variants.map((v) => (
                          <div key={v.id} className="relative w-16 group" data-testid={`stamp-variant-${v.id}`}>
                            <div className="w-16 h-16 rounded border border-stone-700 bg-stone-900 overflow-hidden flex items-center justify-center">
                              <img src={v.image} alt={v.label} className="max-w-full max-h-full object-contain" />
                            </div>
                            <p className="text-[10px] text-stone-500 text-center truncate mt-0.5">{v.label}</p>
                            <button
                              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-stone-950 border border-stone-700 text-stone-400 hover:text-red-400 opacity-0 group-hover:opacity-100 flex items-center justify-center"
                              onClick={() => deleteVariantMutation.mutate(v.id)}
                              data-testid={`button-delete-variant-${v.id}`}
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ))}
                        <label className="w-16 h-16 rounded border border-dashed border-stone-600 flex flex-col items-center justify-center text-stone-500 hover:text-amber-400 hover:border-amber-600 cursor-pointer">
                          {uploadingFor === asset.id ? (
                            <LoadingLogo className="h-4 w-4" />
                          ) : (
                            <>
                              <Upload className="h-4 w-4" />
                              <span className="text-[9px] mt-0.5">Variant</span>
                            </>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleVariantFile(asset, file);
                              e.target.value = '';
                            }}
                            data-testid={`input-upload-variant-${asset.id}`}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
