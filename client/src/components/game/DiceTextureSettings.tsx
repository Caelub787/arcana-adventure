import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Trash2, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, Check, X, Info, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, type DiceTexture } from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/hooks/use-toast';

type DieType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';

interface DiceTextureSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DIE_TYPES: { type: DieType; label: string; faces: number; description: string }[] = [
  { type: 'd4', label: 'D4', faces: 4, description: 'Tetrahedron - 4 triangular faces' },
  { type: 'd6', label: 'D6', faces: 6, description: 'Cube - 6 square faces' },
  { type: 'd8', label: 'D8', faces: 8, description: 'Octahedron - 8 triangular faces' },
  { type: 'd10', label: 'D10', faces: 10, description: 'Pentagonal trapezohedron - 10 kite-shaped faces' },
  { type: 'd12', label: 'D12', faces: 12, description: 'Dodecahedron - 12 pentagonal faces' },
  { type: 'd20', label: 'D20', faces: 20, description: 'Icosahedron - 20 triangular faces' },
];

const DEFAULT_COLORS = [
  { name: 'Obsidian', bg: '#1a1a2e', text: '#ffffff' },
  { name: 'Ruby', bg: '#9b2335', text: '#ffffff' },
  { name: 'Sapphire', bg: '#0f4c81', text: '#ffffff' },
  { name: 'Emerald', bg: '#046307', text: '#ffffff' },
  { name: 'Amber', bg: '#b45309', text: '#ffffff' },
  { name: 'Amethyst', bg: '#7c3aed', text: '#ffffff' },
  { name: 'Pearl', bg: '#e8e8e8', text: '#1a1a1a' },
  { name: 'Gold', bg: '#d4af37', text: '#1a1a1a' },
];

export function DiceTextureSettings({ open, onOpenChange }: DiceTextureSettingsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedDie, setSelectedDie] = useState<DieType>('d20');
  const [uploadingDie, setUploadingDie] = useState<DieType | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [textureName, setTextureName] = useState('');

  const { data: textures = [], isLoading } = useQuery({
    queryKey: [`/api/users/${user?.id}/dice-textures`],
    queryFn: () => api.getUserDiceTextures(user!.id),
    enabled: !!user?.id && open,
  });

  const createTextureMutation = useMutation({
    mutationFn: (data: { dieType: string; textureData: string; name: string }) =>
      api.createDiceTexture(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${user?.id}/dice-textures`] });
      toast({ title: 'Success', description: 'Dice texture saved!' });
      setPreviewUrl(null);
      setTextureName('');
      setUploadingDie(null);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to save texture', variant: 'destructive' });
    },
  });

  const deleteTextureMutation = useMutation({
    mutationFn: (dieType: string) => api.deleteDiceTexture(dieType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${user?.id}/dice-textures`] });
      toast({ title: 'Success', description: 'Dice texture removed' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to delete texture', variant: 'destructive' });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Error', description: 'Please select an image file', variant: 'destructive' });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Error', description: 'Image must be under 2MB', variant: 'destructive' });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
      setUploadingDie(selectedDie);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveTexture = () => {
    if (!previewUrl || !uploadingDie) return;
    
    createTextureMutation.mutate({
      dieType: uploadingDie,
      textureData: previewUrl,
      name: textureName || `Custom ${uploadingDie.toUpperCase()}`,
    });
  };

  const handleQuickColor = (color: typeof DEFAULT_COLORS[0]) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    
    ctx.fillStyle = color.bg;
    ctx.fillRect(0, 0, 256, 256);
    
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 180);
    gradient.addColorStop(0, `${color.bg}00`);
    gradient.addColorStop(0.7, `${color.bg}00`);
    gradient.addColorStop(1, '#00000066');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
    
    const textureData = canvas.toDataURL('image/png');
    setPreviewUrl(textureData);
    setTextureName(color.name);
    setUploadingDie(selectedDie);
  };

  const getTextureForDie = (dieType: DieType): DiceTexture | undefined => {
    return textures.find((t: DiceTexture) => t.dieType === dieType);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] bg-stone-900 border-stone-700 text-stone-200 p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-xl text-amber-500 font-display flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Customize Your Dice
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 pt-4 space-y-4">
          <div className="grid grid-cols-6 gap-2">
            {DIE_TYPES.map(({ type, label }) => {
              const hasTexture = !!getTextureForDie(type);
              return (
                <Button
                  key={type}
                  variant="outline"
                  onClick={() => setSelectedDie(type)}
                  className={cn(
                    "h-14 flex flex-col items-center justify-center gap-0.5 border-stone-700 bg-stone-800/50 hover:bg-amber-900/30 hover:border-amber-700/70 text-stone-200 relative",
                    selectedDie === type && "ring-2 ring-amber-500 bg-amber-900/20"
                  )}
                  data-testid={`dice-settings-${type}`}
                >
                  <span className="text-lg font-bold">{label}</span>
                  {hasTexture && (
                    <div className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full" />
                  )}
                </Button>
              );
            })}
          </div>

          <div className="border-t border-stone-700 pt-4">
            <Tabs defaultValue="upload" className="w-full">
              <TabsList className="bg-stone-800 border-stone-700 w-full">
                <TabsTrigger value="upload" className="flex-1 data-[state=active]:bg-amber-900/50 data-[state=active]:text-amber-100">
                  Upload Image
                </TabsTrigger>
                <TabsTrigger value="colors" className="flex-1 data-[state=active]:bg-amber-900/50 data-[state=active]:text-amber-100">
                  Quick Colors
                </TabsTrigger>
                <TabsTrigger value="guide" className="flex-1 data-[state=active]:bg-amber-900/50 data-[state=active]:text-amber-100">
                  UV Guide
                </TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="mt-4 space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-stone-600 rounded-lg p-8 text-center cursor-pointer hover:border-amber-600 hover:bg-amber-900/10 transition-colors"
                    >
                      <Upload className="h-8 w-8 mx-auto mb-2 text-stone-400" />
                      <p className="text-sm text-stone-400">Click to upload texture image</p>
                      <p className="text-xs text-stone-500 mt-1">PNG or JPG, max 2MB</p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                      data-testid="dice-texture-file-input"
                    />
                  </div>
                  
                  {previewUrl && uploadingDie === selectedDie && (
                    <div className="w-40 space-y-2">
                      <div className="aspect-square rounded-lg overflow-hidden border-2 border-amber-700 bg-black">
                        <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                      </div>
                      <Input
                        value={textureName}
                        onChange={(e) => setTextureName(e.target.value)}
                        placeholder="Texture name"
                        className="bg-stone-800 border-stone-700"
                        data-testid="dice-texture-name-input"
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={handleSaveTexture}
                          disabled={createTextureMutation.isPending}
                          className="flex-1 bg-green-700 hover:bg-green-600"
                          data-testid="dice-texture-save"
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Save
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setPreviewUrl(null);
                            setTextureName('');
                            setUploadingDie(null);
                          }}
                          className="border-stone-600"
                          data-testid="dice-texture-cancel"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {getTextureForDie(selectedDie) && (
                  <div className="flex items-center justify-between p-3 bg-stone-800 rounded-lg border border-stone-700">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded overflow-hidden border border-stone-600">
                        <img
                          src={getTextureForDie(selectedDie)?.textureData}
                          alt="Current texture"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-stone-200">
                          {getTextureForDie(selectedDie)?.name}
                        </p>
                        <p className="text-xs text-stone-400">Current {selectedDie.toUpperCase()} texture</p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteTextureMutation.mutate(selectedDie)}
                      disabled={deleteTextureMutation.isPending}
                      className="border-red-700 text-red-400 hover:bg-red-900/30"
                      data-testid="dice-texture-delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="colors" className="mt-4">
                <p className="text-sm text-stone-400 mb-3">
                  Quick solid color textures for your dice:
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {DEFAULT_COLORS.map((color) => (
                    <button
                      key={color.name}
                      onClick={() => handleQuickColor(color)}
                      className={cn(
                        "h-16 rounded-lg border-2 border-stone-600 transition-all hover:scale-105 hover:border-amber-500 flex items-center justify-center",
                      )}
                      style={{ backgroundColor: color.bg }}
                      data-testid={`dice-color-${color.name.toLowerCase()}`}
                    >
                      <span className="text-sm font-medium" style={{ color: color.text }}>
                        {color.name}
                      </span>
                    </button>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="guide" className="mt-4">
                <div className="bg-stone-800 rounded-lg p-4 border border-stone-700">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="space-y-3 text-sm text-stone-300">
                      <p>
                        <strong className="text-amber-400">UV Mapping Guide:</strong>
                      </p>
                      <p>
                        Upload a square image (256x256 or 512x512 recommended) that will be wrapped
                        around your die. The texture is applied differently based on die shape:
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-stone-400">
                        <li><strong>D6:</strong> Standard cube unwrap - 6 square faces arranged in a cross pattern</li>
                        <li><strong>D20:</strong> Icosahedron unwrap - 20 triangular faces in a net pattern</li>
                        <li><strong>D4, D8:</strong> Triangular face unwrap</li>
                        <li><strong>D10, D12:</strong> Pentagonal/kite face unwrap</li>
                      </ul>
                      <p className="text-stone-500">
                        For best results, use solid colors or subtle gradients. Complex patterns
                        may appear distorted on non-cube dice.
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default DiceTextureSettings;
