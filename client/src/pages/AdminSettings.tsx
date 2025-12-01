import { useState, useRef, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Item, type SystemSpecies } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { toast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, Pencil, Trash2, Sword, Shield, Package, Sparkles, Box, Coins, Search, Users, GitBranch } from 'lucide-react';

type AdminView = 'dashboard' | 'items' | 'species' | 'feat-trees';

const itemTypeIcons: Record<string, any> = {
  weapon: Sword,
  armor: Shield,
  consumable: Package,
  utility: Sparkles,
  container: Box,
  currency: Coins,
};

const rarityColors: Record<string, string> = {
  common: 'bg-stone-600',
  uncommon: 'bg-green-600',
  rare: 'bg-blue-600',
  epic: 'bg-purple-600',
  legendary: 'bg-amber-600',
};

const sizeOptions = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];

export default function AdminSettings() {
  const [, setLocation] = useLocation();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  
  const [currentView, setCurrentView] = useState<AdminView>('dashboard');
  const [selectedSystem, setSelectedSystem] = useState('Arcana Adventure');
  
  const [showAddItem, setShowAddItem] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const [showAddSpecies, setShowAddSpecies] = useState(false);
  const [editingSpecies, setEditingSpecies] = useState<SystemSpecies | null>(null);
  const [speciesSearchQuery, setSpeciesSearchQuery] = useState('');

  const { data: systemItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['system-items'],
    queryFn: () => api.getSystemItems(),
    enabled: isAdmin && currentView === 'items',
  });

  const { data: systemSpecies = [], isLoading: speciesLoading } = useQuery({
    queryKey: ['system-species', selectedSystem],
    queryFn: () => api.getSystemSpecies(selectedSystem),
    enabled: isAdmin && currentView === 'species',
  });

  const createItemMutation = useMutation({
    mutationFn: (item: Partial<Item>) => api.createSystemItem(item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-items'] });
      setShowAddItem(false);
      toast({ title: 'Item Created', description: 'System item created successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Item> }) => api.updateSystemItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-items'] });
      setEditingItem(null);
      toast({ title: 'Item Updated', description: 'System item updated successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: string) => api.deleteSystemItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-items'] });
      toast({ title: 'Item Deleted', description: 'System item deleted successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const createSpeciesMutation = useMutation({
    mutationFn: (species: Partial<SystemSpecies>) => api.createSystemSpecies({ ...species, systemName: selectedSystem }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-species'] });
      setShowAddSpecies(false);
      toast({ title: 'Species Created', description: 'Species created successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateSpeciesMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<SystemSpecies> }) => api.updateSystemSpecies(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-species'] });
      setEditingSpecies(null);
      toast({ title: 'Species Updated', description: 'Species updated successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteSpeciesMutation = useMutation({
    mutationFn: (id: string) => api.deleteSystemSpecies(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-species'] });
      toast({ title: 'Species Deleted', description: 'Species deleted successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-200 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-500 mb-4">Access Denied</h1>
          <p className="text-stone-400 mb-6">You do not have permission to access this page.</p>
          <Button onClick={() => setLocation('/')} variant="outline">
            Return Home
          </Button>
        </div>
      </div>
    );
  }

  const debouncedSearchQuery = useDebouncedValue(searchQuery, 150);
  const debouncedSpeciesSearchQuery = useDebouncedValue(speciesSearchQuery, 150);
  
  const filteredItems = useMemo(() => {
    return systemItems.filter((item: Item) => {
      const matchesSearch = item.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
                            (item.description?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()));
      const matchesType = typeFilter === 'all' || item.itemType === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [systemItems, debouncedSearchQuery, typeFilter]);

  const filteredSpecies = useMemo(() => {
    return systemSpecies.filter((species: SystemSpecies) => {
      return species.name.toLowerCase().includes(debouncedSpeciesSearchQuery.toLowerCase()) ||
             (species.description?.toLowerCase().includes(debouncedSpeciesSearchQuery.toLowerCase()));
    });
  }, [systemSpecies, debouncedSpeciesSearchQuery]);

  const handleBackNavigation = () => {
    if (currentView === 'dashboard') {
      setLocation('/');
    } else {
      setCurrentView('dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-200">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBackNavigation}
            className="text-stone-400 hover:text-stone-200"
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-amber-500">Admin Settings</h1>
            <p className="text-stone-400 text-sm">
              {currentView === 'dashboard' ? 'Manage game system settings' : 
               currentView === 'items' ? 'System Items' :
               currentView === 'species' ? 'Species / Races' : 'Feat Trees'}
            </p>
          </div>
          <div className="w-[200px]">
            <Select value={selectedSystem} onValueChange={setSelectedSystem}>
              <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-system">
                <SelectValue placeholder="Select System" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Arcana Adventure">Arcana Adventure</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {currentView === 'dashboard' && (
          <DashboardView onNavigate={setCurrentView} />
        )}

        {currentView === 'items' && (
          <ItemsView
            items={filteredItems}
            isLoading={itemsLoading}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            typeFilter={typeFilter}
            setTypeFilter={setTypeFilter}
            onAddItem={() => setShowAddItem(true)}
            onEditItem={setEditingItem}
            onDeleteItem={(id) => {
              if (confirm('Are you sure you want to delete this item?')) {
                deleteItemMutation.mutate(id);
              }
            }}
          />
        )}

        {currentView === 'species' && (
          <SpeciesView
            species={filteredSpecies}
            isLoading={speciesLoading}
            searchQuery={speciesSearchQuery}
            setSearchQuery={setSpeciesSearchQuery}
            onAddSpecies={() => setShowAddSpecies(true)}
            onEditSpecies={setEditingSpecies}
            onDeleteSpecies={(id) => {
              if (confirm('Are you sure you want to delete this species?')) {
                deleteSpeciesMutation.mutate(id);
              }
            }}
          />
        )}

        {currentView === 'feat-trees' && (
          <FeatTreesView />
        )}

        <ItemFormDialog
          open={showAddItem}
          onOpenChange={setShowAddItem}
          onSave={(data) => createItemMutation.mutate(data)}
          isLoading={createItemMutation.isPending}
        />

        {editingItem && (
          <ItemFormDialog
            open={!!editingItem}
            onOpenChange={() => setEditingItem(null)}
            onSave={(data) => updateItemMutation.mutate({ id: editingItem.id, data })}
            initialData={editingItem}
            isLoading={updateItemMutation.isPending}
          />
        )}

        <SpeciesFormDialog
          open={showAddSpecies}
          onOpenChange={setShowAddSpecies}
          onSave={(data) => createSpeciesMutation.mutate(data)}
          isLoading={createSpeciesMutation.isPending}
        />

        {editingSpecies && (
          <SpeciesFormDialog
            open={!!editingSpecies}
            onOpenChange={() => setEditingSpecies(null)}
            onSave={(data) => updateSpeciesMutation.mutate({ id: editingSpecies.id, data })}
            initialData={editingSpecies}
            isLoading={updateSpeciesMutation.isPending}
          />
        )}
      </div>
    </div>
  );
}

function DashboardView({ onNavigate }: { onNavigate: (view: AdminView) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card 
        className="bg-stone-900 border-stone-700 cursor-pointer hover:border-amber-600 transition-colors"
        onClick={() => onNavigate('items')}
        data-testid="card-system-items"
      >
        <CardHeader>
          <div className="h-12 w-12 rounded-lg bg-amber-700/20 flex items-center justify-center mb-2">
            <Package className="h-6 w-6 text-amber-500" />
          </div>
          <CardTitle className="text-amber-500">System Items</CardTitle>
          <CardDescription className="text-stone-400">
            Manage weapons, armor, consumables, and other items available across all campaigns
          </CardDescription>
        </CardHeader>
      </Card>

      <Card 
        className="bg-stone-900 border-stone-700 cursor-pointer hover:border-amber-600 transition-colors"
        onClick={() => onNavigate('species')}
        data-testid="card-system-species"
      >
        <CardHeader>
          <div className="h-12 w-12 rounded-lg bg-emerald-700/20 flex items-center justify-center mb-2">
            <Users className="h-6 w-6 text-emerald-500" />
          </div>
          <CardTitle className="text-emerald-500">System Species</CardTitle>
          <CardDescription className="text-stone-400">
            Define playable races and species with their unique traits and abilities
          </CardDescription>
        </CardHeader>
      </Card>

      <Card 
        className="bg-stone-900 border-stone-700 cursor-pointer hover:border-amber-600 transition-colors"
        onClick={() => onNavigate('feat-trees')}
        data-testid="card-feat-trees"
      >
        <CardHeader>
          <div className="h-12 w-12 rounded-lg bg-purple-700/20 flex items-center justify-center mb-2">
            <GitBranch className="h-6 w-6 text-purple-500" />
          </div>
          <CardTitle className="text-purple-500">Feat Trees</CardTitle>
          <CardDescription className="text-stone-400">
            Create and manage feat progression trees for characters
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

interface ItemsViewProps {
  items: Item[];
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  typeFilter: string;
  setTypeFilter: (t: string) => void;
  onAddItem: () => void;
  onEditItem: (item: Item) => void;
  onDeleteItem: (id: string) => void;
}

function ItemsView({ items, isLoading, searchQuery, setSearchQuery, typeFilter, setTypeFilter, onAddItem, onEditItem, onDeleteItem }: ItemsViewProps) {
  return (
    <Card className="bg-stone-900 border-stone-700">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-amber-500">System Items</CardTitle>
        <Button
          onClick={onAddItem}
          className="bg-amber-700 hover:bg-amber-600"
          data-testid="button-add-system-item"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Item
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
            <Input
              placeholder="Search items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-stone-800 border-stone-700"
              data-testid="input-search-items"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px] bg-stone-800 border-stone-700" data-testid="select-type-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="weapon">Weapons</SelectItem>
              <SelectItem value="armor">Armor</SelectItem>
              <SelectItem value="consumable">Consumables</SelectItem>
              <SelectItem value="utility">Utilities</SelectItem>
              <SelectItem value="container">Containers</SelectItem>
              <SelectItem value="currency">Currency</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-stone-400">Loading items...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-stone-400">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-bold">No system items found</p>
            <p className="text-sm mt-2">Create items that will be available across all campaigns</p>
          </div>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="space-y-2">
              {items.map((item: Item) => {
                const Icon = itemTypeIcons[item.itemType] || Package;
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 p-3 rounded-lg bg-stone-800 border border-stone-700 hover:border-stone-600"
                    data-testid={`item-row-${item.id}`}
                  >
                    {item.image ? (
                      <img src={item.image} alt={item.name} className="h-12 w-12 rounded object-cover" />
                    ) : (
                      <div className="h-12 w-12 rounded bg-stone-700 flex items-center justify-center">
                        <Icon className="h-6 w-6 text-stone-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{item.name}</span>
                        <Badge className={`${rarityColors[item.rarity]} text-xs`}>
                          {item.rarity}
                        </Badge>
                      </div>
                      <div className="text-sm text-stone-400 flex items-center gap-2">
                        <span className="capitalize">{item.itemType}</span>
                        {item.damage && <span>| {item.damage} {item.damageType}</span>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEditItem(item)}
                        className="text-stone-400 hover:text-amber-500"
                        data-testid={`button-edit-${item.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDeleteItem(item.id)}
                        className="text-stone-400 hover:text-red-500"
                        data-testid={`button-delete-${item.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

interface SpeciesViewProps {
  species: SystemSpecies[];
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onAddSpecies: () => void;
  onEditSpecies: (species: SystemSpecies) => void;
  onDeleteSpecies: (id: string) => void;
}

function SpeciesView({ species, isLoading, searchQuery, setSearchQuery, onAddSpecies, onEditSpecies, onDeleteSpecies }: SpeciesViewProps) {
  return (
    <Card className="bg-stone-900 border-stone-700">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-emerald-500">System Species</CardTitle>
        <Button
          onClick={onAddSpecies}
          className="bg-emerald-700 hover:bg-emerald-600"
          data-testid="button-add-species"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Species
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
            <Input
              placeholder="Search species..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-stone-800 border-stone-700"
              data-testid="input-search-species"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-stone-400">Loading species...</div>
        ) : species.length === 0 ? (
          <div className="text-center py-12 text-stone-400">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-bold">No species found</p>
            <p className="text-sm mt-2">Create playable species for character creation</p>
          </div>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="space-y-2">
              {species.map((s: SystemSpecies) => (
                <div
                  key={s.id}
                  className="flex items-center gap-4 p-3 rounded-lg bg-stone-800 border border-stone-700 hover:border-stone-600"
                  data-testid={`species-row-${s.id}`}
                >
                  <div className="h-12 w-12 rounded bg-stone-700 flex items-center justify-center">
                    <Users className="h-6 w-6 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{s.name}</span>
                      <Badge className="bg-stone-600 text-xs">{s.size}</Badge>
                    </div>
                    <div className="text-sm text-stone-400 flex flex-wrap gap-2">
                      <span>HP: {s.startingHp}</span>
                      <span>| Speed: {s.speed}ft</span>
                      {s.flySpeed > 0 && <span>| Fly: {s.flySpeed}ft</span>}
                      <span>| Armor: {s.naturalArmor}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEditSpecies(s)}
                      className="text-stone-400 hover:text-emerald-500"
                      data-testid={`button-edit-species-${s.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDeleteSpecies(s.id)}
                      className="text-stone-400 hover:text-red-500"
                      data-testid={`button-delete-species-${s.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function FeatTreesView() {
  return (
    <Card className="bg-stone-900 border-stone-700">
      <CardHeader>
        <CardTitle className="text-purple-500">Feat Trees</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center py-12 text-stone-400">
          <GitBranch className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="font-bold">Coming Soon</p>
          <p className="text-sm mt-2">Feat tree management will be available in a future update</p>
        </div>
      </CardContent>
    </Card>
  );
}

interface SpeciesFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<SystemSpecies>) => void;
  initialData?: SystemSpecies;
  isLoading?: boolean;
}

function SpeciesFormDialog({ open, onOpenChange, onSave, initialData, isLoading }: SpeciesFormDialogProps) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    description: initialData?.description || '',
    lifespan: initialData?.lifespan || 100,
    speed: initialData?.speed || 30,
    flySpeed: initialData?.flySpeed || 0,
    size: initialData?.size || 'Medium',
    naturalArmor: initialData?.naturalArmor || 5,
    sizeBonus: initialData?.sizeBonus || 0,
    startingHp: initialData?.startingHp || 10,
    startingMaxHp: initialData?.startingMaxHp || 10,
    hpPerLevel: initialData?.hpPerLevel || 5,
    startingEnergy: initialData?.startingEnergy || 10,
    startingMaxEnergy: initialData?.startingMaxEnergy || 10,
    featTree: initialData?.featTree || '',
  });

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ title: 'Error', description: 'Species name is required', variant: 'destructive' });
      return;
    }
    onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-emerald-500">
            {initialData ? 'Edit Species' : 'Create Species'}
          </DialogTitle>
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

              <div>
                <Label>Size</Label>
                <Select value={formData.size} onValueChange={(v) => setFormData({ ...formData, size: v })}>
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
                <Label>Lifespan (years)</Label>
                <Input
                  type="number"
                  value={formData.lifespan}
                  onChange={(e) => setFormData({ ...formData, lifespan: parseInt(e.target.value) || 0 })}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-species-lifespan"
                />
              </div>

              <div>
                <Label>Speed (ft)</Label>
                <Input
                  type="number"
                  value={formData.speed}
                  onChange={(e) => setFormData({ ...formData, speed: parseInt(e.target.value) || 0 })}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-species-speed"
                />
              </div>

              <div>
                <Label>Fly Speed (ft)</Label>
                <Input
                  type="number"
                  value={formData.flySpeed}
                  onChange={(e) => setFormData({ ...formData, flySpeed: parseInt(e.target.value) || 0 })}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-species-flyspeed"
                />
              </div>

              <div>
                <Label>Natural Armor</Label>
                <Input
                  type="number"
                  value={formData.naturalArmor}
                  onChange={(e) => setFormData({ ...formData, naturalArmor: parseInt(e.target.value) || 0 })}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-species-armor"
                />
              </div>

              <div>
                <Label>Size Bonus</Label>
                <Input
                  type="number"
                  value={formData.sizeBonus}
                  onChange={(e) => setFormData({ ...formData, sizeBonus: parseInt(e.target.value) || 0 })}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-species-sizebonus"
                />
              </div>

              <div>
                <Label>Starting HP</Label>
                <Input
                  type="number"
                  value={formData.startingHp}
                  onChange={(e) => setFormData({ ...formData, startingHp: parseInt(e.target.value) || 0 })}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-species-startinghp"
                />
              </div>

              <div>
                <Label>Starting Max HP</Label>
                <Input
                  type="number"
                  value={formData.startingMaxHp}
                  onChange={(e) => setFormData({ ...formData, startingMaxHp: parseInt(e.target.value) || 0 })}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-species-startingmaxhp"
                />
              </div>

              <div>
                <Label>HP Per Level</Label>
                <Input
                  type="number"
                  value={formData.hpPerLevel}
                  onChange={(e) => setFormData({ ...formData, hpPerLevel: parseInt(e.target.value) || 0 })}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-species-hpperlevel"
                />
              </div>

              <div>
                <Label>Starting Energy</Label>
                <Input
                  type="number"
                  value={formData.startingEnergy}
                  onChange={(e) => setFormData({ ...formData, startingEnergy: parseInt(e.target.value) || 0 })}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-species-startingenergy"
                />
              </div>

              <div>
                <Label>Starting Max Energy</Label>
                <Input
                  type="number"
                  value={formData.startingMaxEnergy}
                  onChange={(e) => setFormData({ ...formData, startingMaxEnergy: parseInt(e.target.value) || 0 })}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-species-startingmaxenergy"
                />
              </div>

              <div className="col-span-2">
                <Label>Feat Tree (Reference)</Label>
                <Input
                  value={formData.featTree}
                  onChange={(e) => setFormData({ ...formData, featTree: e.target.value })}
                  placeholder="e.g., Versatile, Draconic Heritage"
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-species-feattree"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-stone-600">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
            className="bg-emerald-700 hover:bg-emerald-600"
            data-testid="button-save-species"
          >
            {isLoading ? 'Saving...' : initialData ? 'Update Species' : 'Create Species'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<Item>) => void;
  initialData?: Item;
  isLoading?: boolean;
}

function ItemFormDialog({ open, onOpenChange, onSave, initialData, isLoading }: ItemFormDialogProps) {
  const [formData, setFormData] = useState<{
    name: string;
    image: string;
    description: string;
    rules: string;
    rulesVisible: boolean;
    itemType: string;
    rarity: string;
    quantity: number;
    damage: string;
    damageType: string;
    mod: number | string;
    range: number | string;
    aoe: string;
    attribute: string;
    size: string;
    isHeavy: boolean;
    ammunitionType: string;
    weaponCategory: string;
    breakChance: number;
    itemWeight: number | string;
    price: number | string;
    currency: string;
    durability: number | string;
    isContainer: boolean;
    carryCapacity: number | string;
  }>({
    name: initialData?.name || '',
    image: initialData?.image || '',
    description: initialData?.description || '',
    rules: '',
    rulesVisible: true,
    itemType: initialData?.itemType || 'utility',
    rarity: initialData?.rarity || 'common',
    quantity: initialData?.quantity || 1,
    damage: initialData?.damage || '',
    damageType: initialData?.damageType || '',
    mod: initialData?.mod || 0,
    range: initialData?.range || 0,
    aoe: initialData?.aoe || 'none',
    attribute: initialData?.attribute || '',
    size: initialData?.size || '',
    isHeavy: (initialData as any)?.isHeavy || false,
    ammunitionType: (initialData as any)?.ammunitionType || '',
    weaponCategory: (initialData as any)?.weaponCategory || '',
    breakChance: (initialData as any)?.breakChance ?? 10,
    itemWeight: initialData?.itemWeight || 0,
    price: 0,
    currency: 'copper',
    durability: initialData?.durability || 10,
    isContainer: initialData?.isContainer || false,
    carryCapacity: initialData?.carryCapacity || 0,
  });

  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setFormData({ ...formData, image: event.target?.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ title: 'Error', description: 'Item name is required', variant: 'destructive' });
      return;
    }
    const cleanedData = {
      ...formData,
      mod: Number(formData.mod) || 0,
      range: Number(formData.range) || 0,
      itemWeight: Number(formData.itemWeight) || 0,
      durability: Number(formData.durability) || 10,
      price: Number(formData.price) || 0,
      carryCapacity: Number(formData.carryCapacity) || 0,
      quantity: Number(formData.quantity) || 1,
      breakChance: formData.itemType === 'ammunition' ? formData.breakChance : 10,
      aoe: formData.aoe === 'none' ? undefined : formData.aoe,
    };
    onSave(cleanedData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-amber-500">
            {initialData ? 'Edit System Item' : 'Create System Item'}
          </DialogTitle>
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
                  data-testid="input-item-name"
                />
              </div>

              <div>
                <Label>Type</Label>
                <Select value={formData.itemType} onValueChange={(v) => setFormData({ ...formData, itemType: v })}>
                  <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-item-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weapon">Weapon</SelectItem>
                    <SelectItem value="ammunition">Ammunition</SelectItem>
                    <SelectItem value="armor">Armor</SelectItem>
                    <SelectItem value="consumable">Consumable</SelectItem>
                    <SelectItem value="utility">Utility</SelectItem>
                    <SelectItem value="container">Container</SelectItem>
                    <SelectItem value="currency">Currency</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Rarity</Label>
                <Select value={formData.rarity} onValueChange={(v) => setFormData({ ...formData, rarity: v })}>
                  <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-item-rarity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="common">Common</SelectItem>
                    <SelectItem value="uncommon">Uncommon</SelectItem>
                    <SelectItem value="rare">Rare</SelectItem>
                    <SelectItem value="epic">Epic</SelectItem>
                    <SelectItem value="legendary">Legendary</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="bg-stone-800 border-stone-700 min-h-[80px]"
                  data-testid="textarea-description"
                />
              </div>

              <div className="col-span-2">
                <Label>Item Image</Label>
                <div className="flex items-center gap-4">
                  {formData.image ? (
                    <div className="relative">
                      <img src={formData.image} alt="Item" className="h-16 w-16 rounded object-cover border border-stone-600" />
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, image: '' })}
                        className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full h-5 w-5 text-xs flex items-center justify-center hover:bg-red-500"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div className="h-16 w-16 rounded bg-stone-700 flex items-center justify-center border border-stone-600">
                      <Package className="h-8 w-8 text-stone-500" />
                    </div>
                  )}
                  <div>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => imageInputRef.current?.click()}
                      className="border-stone-600"
                    >
                      Upload Image
                    </Button>
                  </div>
                </div>
              </div>

              {formData.itemType === 'ammunition' && (
                <>
                  <div className="col-span-2">
                    <Label>Ammunition Type</Label>
                    <Select value={formData.ammunitionType} onValueChange={(v) => setFormData({ ...formData, ammunitionType: v })}>
                      <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-ammunition-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="arrow">Arrow</SelectItem>
                        <SelectItem value="bolt">Bolt</SelectItem>
                        <SelectItem value="bullet">Bullet</SelectItem>
                        <SelectItem value="dart">Dart</SelectItem>
                        <SelectItem value="stone">Stone</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label>Break Chance: {formData.breakChance}%</Label>
                    <Slider
                      value={[formData.breakChance]}
                      onValueChange={(v) => setFormData({ ...formData, breakChance: v[0] })}
                      min={0}
                      max={100}
                      step={1}
                      className="mt-2"
                      data-testid="slider-break-chance"
                    />
                    <p className="text-xs text-stone-500 mt-1">Chance of ammunition breaking on each attack roll</p>
                  </div>
                </>
              )}

              {(formData.itemType === 'weapon' || formData.itemType === 'consumable' || formData.itemType === 'ammunition') && (
                <>
                  <div>
                    <Label>Damage (e.g., 1d8)</Label>
                    <Input
                      value={formData.damage}
                      onChange={(e) => setFormData({ ...formData, damage: e.target.value })}
                      className="bg-stone-800 border-stone-700"
                      data-testid="input-damage"
                    />
                  </div>
                  <div>
                    <Label>Damage Type</Label>
                    <Select value={formData.damageType} onValueChange={(v) => setFormData({ ...formData, damageType: v })}>
                      <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-damage-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Sharp">Sharp</SelectItem>
                        <SelectItem value="Blunt">Blunt</SelectItem>
                        <SelectItem value="Piercing">Piercing</SelectItem>
                        <SelectItem value="Flame">Flame</SelectItem>
                        <SelectItem value="Frost">Frost</SelectItem>
                        <SelectItem value="Storm">Storm</SelectItem>
                        <SelectItem value="Tide">Tide</SelectItem>
                        <SelectItem value="Stone">Stone</SelectItem>
                        <SelectItem value="Flux">Flux</SelectItem>
                        <SelectItem value="Light">Light</SelectItem>
                        <SelectItem value="Dark">Dark</SelectItem>
                        <SelectItem value="Sound">Sound</SelectItem>
                        <SelectItem value="Health">Health</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Modifier</Label>
                    <Input
                      type="number"
                      value={formData.mod || ''}
                      onChange={(e) => setFormData({ ...formData, mod: e.target.value === '' ? '' : parseInt(e.target.value) })}
                      className="bg-stone-800 border-stone-700"
                      data-testid="input-modifier"
                    />
                  </div>
                  <div>
                    <Label>Range (ft)</Label>
                    <Input
                      type="number"
                      value={formData.range || ''}
                      onChange={(e) => setFormData({ ...formData, range: e.target.value === '' ? '' : parseInt(e.target.value) })}
                      className="bg-stone-800 border-stone-700"
                      data-testid="input-range"
                    />
                  </div>
                </>
              )}

              {formData.itemType === 'weapon' && (
                <>
                  <div>
                    <Label>Weapon Category</Label>
                    <Select value={formData.weaponCategory} onValueChange={(v) => setFormData({ ...formData, weaponCategory: v })}>
                      <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-weapon-category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="melee">Melee</SelectItem>
                        <SelectItem value="ranged">Ranged</SelectItem>
                        <SelectItem value="thrown">Thrown</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Ammunition Required</Label>
                    <Select value={formData.ammunitionType} onValueChange={(v) => setFormData({ ...formData, ammunitionType: v })}>
                      <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-weapon-ammo">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        <SelectItem value="arrow">Arrow</SelectItem>
                        <SelectItem value="bolt">Bolt</SelectItem>
                        <SelectItem value="bullet">Bullet</SelectItem>
                        <SelectItem value="dart">Dart</SelectItem>
                        <SelectItem value="stone">Stone</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={formData.isHeavy}
                        onCheckedChange={(checked) => setFormData({ ...formData, isHeavy: !!checked })}
                        data-testid="checkbox-heavy"
                      />
                      <Label>Two-Handed / Heavy Weapon</Label>
                    </div>
                    <p className="text-xs text-stone-500 mt-1">Two-handed weapons require both hands and occupy both weapon slots</p>
                  </div>
                </>
              )}

              <div>
                <Label>Weight (lbs)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.itemWeight || ''}
                  onChange={(e) => setFormData({ ...formData, itemWeight: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-weight"
                />
              </div>

              <div>
                <Label>Durability (0-10)</Label>
                <Input
                  type="number"
                  min="0"
                  max="10"
                  value={formData.durability || ''}
                  onChange={(e) => setFormData({ ...formData, durability: e.target.value === '' ? '' : Math.min(10, Math.max(0, parseInt(e.target.value))) })}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-durability"
                />
              </div>

              <div>
                <Label>Price</Label>
                <Input
                  type="number"
                  value={formData.price || ''}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value === '' ? '' : parseInt(e.target.value) })}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-price"
                />
              </div>

              <div>
                <Label>Currency</Label>
                <Select value={formData.currency} onValueChange={(v) => setFormData({ ...formData, currency: v })}>
                  <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="copper">Copper</SelectItem>
                    <SelectItem value="silver">Silver</SelectItem>
                    <SelectItem value="gold">Gold</SelectItem>
                    <SelectItem value="platinum">Platinum</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.itemType === 'container' && (
                <div className="col-span-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Checkbox
                      checked={formData.isContainer}
                      onCheckedChange={(checked) => setFormData({ ...formData, isContainer: !!checked })}
                      data-testid="checkbox-container"
                    />
                    <Label>Is Container</Label>
                  </div>
                  {formData.isContainer && (
                    <div>
                      <Label>Carry Capacity (lbs)</Label>
                      <Input
                        type="number"
                        value={formData.carryCapacity || ''}
                        onChange={(e) => setFormData({ ...formData, carryCapacity: e.target.value === '' ? '' : parseInt(e.target.value) })}
                        className="bg-stone-800 border-stone-700"
                        data-testid="input-carry-capacity"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-stone-600">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
            className="bg-amber-700 hover:bg-amber-600"
            data-testid="button-save-item"
          >
            {isLoading ? 'Saving...' : initialData ? 'Update Item' : 'Create Item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
