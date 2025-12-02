import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Item, type SystemSpecies, type FeatTree, type Feat, type FeatConnection, type FeatTreeWithData, type FeatTemplate } from '@/lib/api';
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
import { ArrowLeft, Plus, Pencil, Trash2, Sword, Shield, Package, Sparkles, Box, Coins, Search, Users, GitBranch, Library, Link, X, GripVertical, Star, Zap, Heart, ShieldCheck, BookOpen } from 'lucide-react';
import { ImageBrowser } from '@/components/ImageBrowser';

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

const tierColors: Record<number, string> = {
  1: 'border-stone-500 bg-stone-700/50',
  2: 'border-green-500 bg-green-700/30',
  3: 'border-blue-500 bg-blue-700/30',
  4: 'border-purple-500 bg-purple-700/30',
  5: 'border-amber-500 bg-amber-700/30',
};

const effectTypeIcons: Record<string, any> = {
  hp_bonus: Heart,
  dc_bonus: ShieldCheck,
  spell_grant: BookOpen,
  skill_bonus: Star,
  attribute_bonus: Zap,
};

function FeatTreesView() {
  const queryClient = useQueryClient();
  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
  const [showAddTree, setShowAddTree] = useState(false);
  const [editingTree, setEditingTree] = useState<FeatTree | null>(null);
  const [showFeatEditor, setShowFeatEditor] = useState(false);
  const [editingFeat, setEditingFeat] = useState<Feat | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [showSaveAsTemplate, setShowSaveAsTemplate] = useState(false);
  const [featToSaveAsTemplate, setFeatToSaveAsTemplate] = useState<Partial<Feat> | null>(null);

  const { data: featTrees = [], isLoading: treesLoading } = useQuery({
    queryKey: ['feat-trees'],
    queryFn: () => api.getFeatTrees(),
  });

  const { data: treeData, isLoading: treeDataLoading } = useQuery({
    queryKey: ['feat-tree', selectedTreeId],
    queryFn: () => selectedTreeId ? api.getFeatTree(selectedTreeId) : null,
    enabled: !!selectedTreeId,
  });

  const { data: featTemplates = [] } = useQuery({
    queryKey: ['feat-templates'],
    queryFn: () => api.getFeatTemplates(),
  });

  const createTemplateMutation = useMutation({
    mutationFn: (template: Partial<FeatTemplate>) => api.createFeatTemplate(template),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feat-templates'] });
      setShowSaveAsTemplate(false);
      setFeatToSaveAsTemplate(null);
      toast({ title: 'Success', description: 'Feat template created' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => api.deleteFeatTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feat-templates'] });
      toast({ title: 'Success', description: 'Template deleted' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const createTreeMutation = useMutation({
    mutationFn: (tree: Partial<FeatTree>) => api.createFeatTree(tree),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feat-trees'] });
      setShowAddTree(false);
      toast({ title: 'Success', description: 'Feat tree created' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const updateTreeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<FeatTree> }) => api.updateFeatTree(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feat-trees'] });
      queryClient.invalidateQueries({ queryKey: ['feat-tree', selectedTreeId] });
      setEditingTree(null);
      toast({ title: 'Success', description: 'Feat tree updated' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const deleteTreeMutation = useMutation({
    mutationFn: (id: string) => api.deleteFeatTree(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feat-trees'] });
      if (selectedTreeId === editingTree?.id) {
        setSelectedTreeId(null);
      }
      toast({ title: 'Success', description: 'Feat tree deleted' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const createFeatMutation = useMutation({
    mutationFn: ({ treeId, feat }: { treeId: string; feat: Partial<Feat> }) => api.createFeat(treeId, feat),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feat-tree', selectedTreeId] });
      setShowFeatEditor(false);
      setEditingFeat(null);
      toast({ title: 'Success', description: 'Feat created' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const updateFeatMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Feat> }) => api.updateFeat(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feat-tree', selectedTreeId] });
      setShowFeatEditor(false);
      setEditingFeat(null);
      toast({ title: 'Success', description: 'Feat updated' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const deleteFeatMutation = useMutation({
    mutationFn: (id: string) => api.deleteFeat(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feat-tree', selectedTreeId] });
      toast({ title: 'Success', description: 'Feat deleted' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const createConnectionMutation = useMutation({
    mutationFn: ({ treeId, connection }: { treeId: string; connection: Partial<FeatConnection> }) => 
      api.createFeatConnection(treeId, connection),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feat-tree', selectedTreeId] });
      setConnectingFrom(null);
      toast({ title: 'Success', description: 'Connection created' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const deleteConnectionMutation = useMutation({
    mutationFn: (id: string) => api.deleteFeatConnection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feat-tree', selectedTreeId] });
      toast({ title: 'Success', description: 'Connection removed' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const handleGridCellClick = (x: number, y: number) => {
    if (!selectedTreeId || !treeData) return;
    
    const existingFeat = treeData.feats.find((f: Feat) => f.gridX === x && f.gridY === y);
    
    if (existingFeat) {
      if (connectingFrom) {
        if (connectingFrom !== existingFeat.id) {
          createConnectionMutation.mutate({
            treeId: selectedTreeId,
            connection: { fromFeatId: connectingFrom, toFeatId: existingFeat.id, isOptional: false },
          });
        } else {
          setConnectingFrom(null);
        }
      }
    } else if (!connectingFrom) {
      setEditingFeat({ gridX: x, gridY: y, tier: 1, cost: 1 } as Feat);
      setShowFeatEditor(true);
    }
  };

  const handleFeatDoubleClick = (feat: Feat) => {
    setEditingFeat(feat);
    setShowFeatEditor(true);
  };

  const handleStartConnect = (featId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConnectingFrom(featId);
  };

  const renderGrid = () => {
    if (!treeData) return null;
    
    const { tree, feats, connections } = treeData;
    const gridWidth = tree.gridWidth || 7;
    const gridHeight = tree.gridHeight || 5;
    const cellSize = 90;
    
    const featMap = new Map<string, Feat>();
    feats.forEach((f: Feat) => {
      featMap.set(`${f.gridX},${f.gridY}`, f);
    });
    const featById = new Map<string, Feat>();
    feats.forEach((f: Feat) => featById.set(f.id, f));

    return (
      <div className="relative overflow-auto bg-stone-800/50 rounded-lg p-4">
        {connectingFrom && (
          <div className="absolute top-2 right-2 z-20 flex items-center gap-2 bg-purple-600 px-3 py-1 rounded text-sm">
            <span>Click another feat to connect</span>
            <Button size="sm" variant="ghost" onClick={() => setConnectingFrom(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        
        <svg 
          className="absolute top-0 left-0 pointer-events-none"
          style={{ 
            width: gridWidth * cellSize + 80, 
            height: gridHeight * cellSize + 80 
          }}
        >
          {connections.map((conn: FeatConnection) => {
            const from = featById.get(conn.fromFeatId);
            const to = featById.get(conn.toFeatId);
            if (!from || !to) return null;
            
            const x1 = from.gridX * cellSize + cellSize / 2 + 16;
            const y1 = from.gridY * cellSize + cellSize / 2 + 16;
            const x2 = to.gridX * cellSize + cellSize / 2 + 16;
            const y2 = to.gridY * cellSize + cellSize / 2 + 16;
            
            return (
              <g key={conn.id}>
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={conn.isOptional ? '#a855f7' : '#eab308'}
                  strokeWidth={3}
                  strokeDasharray={conn.isOptional ? '5,5' : undefined}
                  markerEnd="url(#arrowhead)"
                />
                <circle
                  cx={(x1 + x2) / 2}
                  cy={(y1 + y2) / 2}
                  r={10}
                  fill="#292524"
                  stroke="#78716c"
                  className="cursor-pointer pointer-events-auto hover:stroke-red-500"
                  onClick={() => deleteConnectionMutation.mutate(conn.id)}
                />
                <text
                  x={(x1 + x2) / 2}
                  y={(y1 + y2) / 2 + 4}
                  textAnchor="middle"
                  className="text-xs fill-red-400 pointer-events-none"
                >
                  ×
                </text>
              </g>
            );
          })}
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#eab308" />
            </marker>
          </defs>
        </svg>
        
        <div 
          className="grid gap-1 relative"
          style={{ 
            gridTemplateColumns: `repeat(${gridWidth}, ${cellSize}px)`,
            gridTemplateRows: `repeat(${gridHeight}, ${cellSize}px)`,
          }}
        >
          {Array.from({ length: gridHeight }).map((_, y) =>
            Array.from({ length: gridWidth }).map((_, x) => {
              const feat = featMap.get(`${x},${y}`);
              
              return (
                <div
                  key={`${x},${y}`}
                  className={`
                    border-2 border-dashed border-stone-600 rounded-lg
                    flex items-center justify-center cursor-pointer
                    hover:border-stone-400 transition-colors relative
                    ${feat ? tierColors[feat.tier] || tierColors[1] : 'bg-stone-900/50'}
                    ${connectingFrom && feat ? 'ring-2 ring-purple-500' : ''}
                  `}
                  onClick={() => handleGridCellClick(x, y)}
                  onDoubleClick={() => feat && handleFeatDoubleClick(feat)}
                  data-testid={`grid-cell-${x}-${y}`}
                >
                  {feat ? (
                    <div className="absolute inset-1 flex flex-col items-center justify-center text-center p-1">
                      <div className="text-xs font-bold truncate w-full">{feat.name}</div>
                      <Badge variant="secondary" className="text-[10px] mt-1">
                        Tier {feat.tier}
                      </Badge>
                      <div className="absolute top-1 right-1 flex gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5 hover:bg-purple-600"
                          onClick={(e) => handleStartConnect(feat.id, e)}
                          title="Connect to another feat"
                        >
                          <Link className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5 hover:bg-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('Delete this feat?')) {
                              deleteFeatMutation.mutate(feat.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Plus className="h-6 w-6 text-stone-600" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  if (!selectedTreeId) {
    return (
      <Card className="bg-stone-900 border-stone-700">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-purple-500">Feat Trees</CardTitle>
          <Button onClick={() => setShowAddTree(true)} className="bg-purple-600 hover:bg-purple-700">
            <Plus className="h-4 w-4 mr-2" />
            New Tree
          </Button>
        </CardHeader>
        <CardContent>
          {treesLoading ? (
            <div className="text-center py-12 text-stone-400">Loading...</div>
          ) : featTrees.length === 0 ? (
            <div className="text-center py-12 text-stone-400">
              <GitBranch className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="font-bold">No feat trees yet</p>
              <p className="text-sm mt-2">Create a feat tree to define character progression paths</p>
            </div>
          ) : (
            <div className="space-y-2">
              {featTrees.map((tree: FeatTree) => (
                <div
                  key={tree.id}
                  className="flex items-center gap-4 p-4 rounded-lg bg-stone-800 border border-stone-700 hover:border-purple-500 cursor-pointer transition-colors"
                  onClick={() => setSelectedTreeId(tree.id)}
                  data-testid={`tree-row-${tree.id}`}
                >
                  <div className="h-10 w-10 rounded bg-purple-700/30 flex items-center justify-center">
                    <GitBranch className="h-5 w-5 text-purple-400" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{tree.name}</div>
                    <div className="text-sm text-stone-400">
                      {tree.gridWidth}x{tree.gridHeight} grid
                      {tree.description && ` · ${tree.description}`}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); setEditingTree(tree); }}
                      data-testid={`edit-tree-${tree.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-500 hover:text-red-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Delete this feat tree and all its feats?')) {
                          deleteTreeMutation.mutate(tree.id);
                        }
                      }}
                      data-testid={`delete-tree-${tree.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>

        <FeatTreeFormDialog
          open={showAddTree}
          onOpenChange={setShowAddTree}
          onSave={(data) => createTreeMutation.mutate(data)}
          isLoading={createTreeMutation.isPending}
        />

        {editingTree && (
          <FeatTreeFormDialog
            open={!!editingTree}
            onOpenChange={() => setEditingTree(null)}
            onSave={(data) => updateTreeMutation.mutate({ id: editingTree.id, data })}
            initialData={editingTree}
            isLoading={updateTreeMutation.isPending}
          />
        )}
      </Card>
    );
  }

  return (
    <Card className="bg-stone-900 border-stone-700">
      <CardHeader className="flex flex-row items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSelectedTreeId(null)}
          className="text-stone-400 hover:text-stone-200"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <CardTitle className="text-purple-500">
            {treeData?.tree.name || 'Loading...'}
          </CardTitle>
          <CardDescription>{treeData?.tree.description}</CardDescription>
        </div>
        <Button
          variant="outline"
          onClick={() => setEditingTree(treeData?.tree || null)}
        >
          <Pencil className="h-4 w-4 mr-2" />
          Edit Tree
        </Button>
      </CardHeader>
      <CardContent>
        {treeDataLoading ? (
          <div className="text-center py-12 text-stone-400">Loading tree...</div>
        ) : (
          <>
            <div className="mb-4 text-sm text-stone-400">
              Click an empty cell to add a feat. Double-click a feat to edit. Use the link button to connect feats.
            </div>
            <ScrollArea className="w-full">
              {renderGrid()}
            </ScrollArea>
          </>
        )}
      </CardContent>

      {editingTree && (
        <FeatTreeFormDialog
          open={!!editingTree}
          onOpenChange={() => setEditingTree(null)}
          onSave={(data) => updateTreeMutation.mutate({ id: editingTree.id, data })}
          initialData={editingTree}
          isLoading={updateTreeMutation.isPending}
        />
      )}

      <FeatFormDialog
        open={showFeatEditor}
        onOpenChange={(open) => {
          setShowFeatEditor(open);
          if (!open) setEditingFeat(null);
        }}
        onSave={(data) => {
          if (editingFeat?.id) {
            updateFeatMutation.mutate({ id: editingFeat.id, data });
          } else if (selectedTreeId) {
            createFeatMutation.mutate({ treeId: selectedTreeId, feat: data });
          }
        }}
        initialData={editingFeat}
        isLoading={createFeatMutation.isPending || updateFeatMutation.isPending}
        featTemplates={featTemplates}
        onSaveAsTemplate={(feat) => {
          setFeatToSaveAsTemplate(feat);
          setShowSaveAsTemplate(true);
        }}
      />

      <SaveAsTemplateDialog
        open={showSaveAsTemplate}
        onOpenChange={(open) => {
          setShowSaveAsTemplate(open);
          if (!open) setFeatToSaveAsTemplate(null);
        }}
        feat={featToSaveAsTemplate}
        onSave={(template) => createTemplateMutation.mutate(template)}
        isLoading={createTemplateMutation.isPending}
      />
    </Card>
  );
}

interface FeatTreeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<FeatTree>) => void;
  initialData?: FeatTree | null;
  isLoading?: boolean;
}

function FeatTreeFormDialog({ open, onOpenChange, onSave, initialData, isLoading }: FeatTreeFormDialogProps) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    description: initialData?.description || '',
    gridWidth: initialData?.gridWidth || 7,
    gridHeight: initialData?.gridHeight || 5,
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        description: initialData.description || '',
        gridWidth: initialData.gridWidth || 7,
        gridHeight: initialData.gridHeight || 5,
      });
    } else {
      setFormData({ name: '', description: '', gridWidth: 7, gridHeight: 5 });
    }
  }, [initialData, open]);

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ title: 'Error', description: 'Name is required', variant: 'destructive' });
      return;
    }
    onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-purple-500">
            {initialData ? 'Edit Feat Tree' : 'Create Feat Tree'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Warrior Path"
              className="bg-stone-800 border-stone-700"
              data-testid="input-tree-name"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Optional description"
              className="bg-stone-800 border-stone-700"
              data-testid="input-tree-description"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Grid Width</Label>
              <Input
                type="number"
                min={3}
                max={15}
                value={formData.gridWidth}
                onChange={(e) => setFormData({ ...formData, gridWidth: parseInt(e.target.value) || 7 })}
                className="bg-stone-800 border-stone-700"
                data-testid="input-tree-width"
              />
            </div>
            <div>
              <Label>Grid Height</Label>
              <Input
                type="number"
                min={3}
                max={15}
                value={formData.gridHeight}
                onChange={(e) => setFormData({ ...formData, gridHeight: parseInt(e.target.value) || 5 })}
                className="bg-stone-800 border-stone-700"
                data-testid="input-tree-height"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isLoading ? 'Saving...' : initialData ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface FeatFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<Feat>) => void;
  initialData?: Feat | null;
  isLoading?: boolean;
  featTemplates?: FeatTemplate[];
  onSaveAsTemplate?: (feat: Partial<Feat>) => void;
}

function FeatFormDialog({ open, onOpenChange, onSave, initialData, isLoading, featTemplates = [], onSaveAsTemplate }: FeatFormDialogProps) {
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    description: initialData?.description || '',
    gridX: initialData?.gridX || 0,
    gridY: initialData?.gridY || 0,
    tier: initialData?.tier || 1,
    cost: initialData?.cost || 1,
    icon: initialData?.icon || '',
    effects: initialData?.effects || [],
  });

  const [newEffect, setNewEffect] = useState({
    type: 'hp_bonus',
    value: 0,
    target: '',
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        description: initialData.description || '',
        gridX: initialData.gridX || 0,
        gridY: initialData.gridY || 0,
        tier: initialData.tier || 1,
        cost: initialData.cost || 1,
        icon: initialData.icon || '',
        effects: initialData.effects || [],
      });
    } else {
      setFormData((prev) => ({
        ...prev,
        name: '',
        description: '',
        icon: '',
        effects: [],
      }));
    }
  }, [initialData, open]);

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ title: 'Error', description: 'Feat name is required', variant: 'destructive' });
      return;
    }
    onSave(formData);
  };

  const addEffect = () => {
    if (newEffect.value === 0 && newEffect.type !== 'spell_grant' && newEffect.type !== 'item_grant') {
      toast({ title: 'Error', description: 'Effect value cannot be 0', variant: 'destructive' });
      return;
    }
    setFormData({
      ...formData,
      effects: [...(formData.effects || []), { ...newEffect }],
    });
    setNewEffect({ type: 'hp_bonus', value: 0, target: '' });
  };

  const removeEffect = (index: number) => {
    const effects = [...(formData.effects || [])];
    effects.splice(index, 1);
    setFormData({ ...formData, effects });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-purple-500 flex items-center gap-2">
            {initialData?.id ? 'Edit Feat' : 'Create Feat'}
            {featTemplates.length > 0 && !initialData?.id && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowTemplateSelector(!showTemplateSelector)}
                className="ml-auto h-7 text-xs"
              >
                <Library className="h-3 w-3 mr-1" />
                From Library
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        {showTemplateSelector && featTemplates.length > 0 && (
          <div className="p-3 bg-purple-900/30 border border-purple-600/50 rounded mb-2">
            <Label className="text-xs text-purple-400 mb-2 block">Select a template to pre-fill:</Label>
            <ScrollArea className="h-32">
              <div className="space-y-1">
                {featTemplates.map((template) => (
                  <Button
                    key={template.id}
                    variant="ghost"
                    className="w-full justify-start text-left h-auto py-2"
                    onClick={() => {
                      setFormData({
                        ...formData,
                        name: template.name,
                        description: template.description || '',
                        tier: template.tier,
                        cost: template.cost,
                        icon: template.icon || '',
                        effects: template.effects || [],
                      });
                      setShowTemplateSelector(false);
                    }}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{template.name}</span>
                      {template.description && (
                        <span className="text-xs text-stone-400 truncate max-w-[250px]">
                          {template.description}
                        </span>
                      )}
                    </div>
                    <Badge variant="secondary" className="ml-auto text-xs">
                      Tier {template.tier}
                    </Badge>
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Power Strike"
              className="bg-stone-800 border-stone-700"
              data-testid="input-feat-name"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe what this feat does"
              className="bg-stone-800 border-stone-700"
              data-testid="input-feat-description"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tier (1-5)</Label>
              <Select
                value={String(formData.tier)}
                onValueChange={(v) => setFormData({ ...formData, tier: parseInt(v) })}
              >
                <SelectTrigger className="bg-stone-800 border-stone-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((t) => (
                    <SelectItem key={t} value={String(t)}>Tier {t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cost (feat points)</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={formData.cost}
                onChange={(e) => setFormData({ ...formData, cost: parseInt(e.target.value) || 1 })}
                className="bg-stone-800 border-stone-700"
                data-testid="input-feat-cost"
              />
            </div>
          </div>

          <div className="border-t border-stone-700 pt-4">
            <Label className="text-base font-semibold">Effects</Label>
            <div className="mt-2 space-y-2">
              {(formData.effects || []).map((effect: any, idx: number) => (
                <div key={idx} className="flex items-center gap-2 bg-stone-800 p-2 rounded">
                  <Badge variant="secondary">{effect.type}</Badge>
                  <span className="text-sm">
                    {effect.type === 'spell_grant' || effect.type === 'item_grant' 
                      ? effect.target 
                      : `+${effect.value}${effect.target ? ` to ${effect.target}` : ''}`}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="ml-auto h-6 w-6 text-red-400"
                    onClick={() => removeEffect(idx)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-3 p-3 bg-stone-800/50 rounded border border-stone-700">
              <div className="grid grid-cols-3 gap-2 mb-2">
                <Select
                  value={newEffect.type}
                  onValueChange={(v) => setNewEffect({ ...newEffect, type: v })}
                >
                  <SelectTrigger className="bg-stone-800 border-stone-700 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hp_bonus">HP Bonus</SelectItem>
                    <SelectItem value="dc_bonus">DC Bonus</SelectItem>
                    <SelectItem value="skill_bonus">Skill Bonus</SelectItem>
                    <SelectItem value="attribute_bonus">Attribute Bonus</SelectItem>
                    <SelectItem value="spell_grant">Grant Spell</SelectItem>
                    <SelectItem value="item_grant">Grant Item</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  value={newEffect.value}
                  onChange={(e) => setNewEffect({ ...newEffect, value: parseInt(e.target.value) || 0 })}
                  placeholder="Value"
                  className="bg-stone-800 border-stone-700 text-xs"
                />
                <Input
                  value={newEffect.target}
                  onChange={(e) => setNewEffect({ ...newEffect, target: e.target.value })}
                  placeholder="Target (optional)"
                  className="bg-stone-800 border-stone-700 text-xs"
                />
              </div>
              <Button size="sm" variant="secondary" onClick={addEffect} className="w-full">
                <Plus className="h-3 w-3 mr-1" /> Add Effect
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex gap-2 mr-auto">
            {onSaveAsTemplate && formData.name.trim() && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onSaveAsTemplate(formData)}
                className="text-purple-400 border-purple-600"
              >
                <Library className="h-3 w-3 mr-1" />
                Save as Template
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={isLoading}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {isLoading ? 'Saving...' : initialData?.id ? 'Update' : 'Create'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface SaveAsTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feat: Partial<Feat> | null;
  onSave: (template: Partial<FeatTemplate>) => void;
  isLoading?: boolean;
}

function SaveAsTemplateDialog({ open, onOpenChange, feat, onSave, isLoading }: SaveAsTemplateDialogProps) {
  const [templateName, setTemplateName] = useState(feat?.name || '');

  useEffect(() => {
    if (feat) {
      setTemplateName(feat.name || '');
    }
  }, [feat]);

  const handleSave = () => {
    if (!templateName.trim()) {
      toast({ title: 'Error', description: 'Template name is required', variant: 'destructive' });
      return;
    }
    if (!feat) return;

    onSave({
      name: templateName,
      description: feat.description || undefined,
      tier: feat.tier || 1,
      cost: feat.cost || 1,
      icon: feat.icon || undefined,
      effects: feat.effects || [],
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-purple-500">Save as Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Template Name</Label>
            <Input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Template name"
              className="bg-stone-800 border-stone-700"
            />
          </div>
          <p className="text-xs text-stone-500">
            This will save the feat's name, description, tier, cost, and effects as a reusable template.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={isLoading}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isLoading ? 'Saving...' : 'Save Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface SpeciesFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<SystemSpecies>) => void;
  initialData?: SystemSpecies;
  isLoading?: boolean;
}

// Calculate size bonus based on size
const getSizeBonusFromSize = (size: string): number => {
  const sizeBonusMap: Record<string, number> = {
    'Tiny': 2,
    'Small': 1,
    'Medium': 0,
    'Large': -1,
    'Giant': -2,
    'Colossal': -3,
  };
  return sizeBonusMap[size] ?? 0;
};

function SpeciesFormDialog({ open, onOpenChange, onSave, initialData, isLoading }: SpeciesFormDialogProps) {
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
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
    carryWeight: number | string;
    featTree: string;
  }>({
    name: initialData?.name || '',
    description: initialData?.description || '',
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
    carryWeight: initialData?.carryWeight ?? '',
    featTree: initialData?.featTree || '',
  });
  
  // Helper to handle numeric input - allows empty string
  const handleNumericChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value === '' ? '' : parseInt(value) });
  };
  
  // Auto-update size bonus when size changes
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
    // Convert string values to numbers, using defaults for empty strings
    onSave({
      ...formData,
      lifespan: Number(formData.lifespan) || 100,
      speed: Number(formData.speed) || 30,
      flySpeed: Number(formData.flySpeed) || 0,
      naturalArmor: Number(formData.naturalArmor) || 5,
      startingHp: Number(formData.startingHp) || 10,
      startingMaxHp: Number(formData.startingMaxHp) || 10,
      hpPerLevel: Number(formData.hpPerLevel) || 5,
      startingEnergy: Number(formData.startingEnergy) || 10,
      startingMaxEnergy: Number(formData.startingMaxEnergy) || 10,
      carryWeight: Number(formData.carryWeight) || 50,
    });
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
                <Label>Lifespan (years)</Label>
                <Input
                  type="number"
                  value={formData.lifespan}
                  onChange={(e) => handleNumericChange('lifespan', e.target.value)}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-species-lifespan"
                />
              </div>

              <div>
                <Label>Speed (ft)</Label>
                <Input
                  type="number"
                  value={formData.speed}
                  onChange={(e) => handleNumericChange('speed', e.target.value)}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-species-speed"
                />
              </div>

              <div>
                <Label>Fly Speed (ft)</Label>
                <Input
                  type="number"
                  value={formData.flySpeed}
                  onChange={(e) => handleNumericChange('flySpeed', e.target.value)}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-species-flyspeed"
                />
              </div>

              <div>
                <Label>Natural Armor</Label>
                <Input
                  type="number"
                  value={formData.naturalArmor}
                  onChange={(e) => handleNumericChange('naturalArmor', e.target.value)}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-species-armor"
                />
              </div>

              <div>
                <Label>Size Bonus (auto-calculated)</Label>
                <Input
                  type="number"
                  value={formData.sizeBonus}
                  readOnly
                  className="bg-stone-800 border-stone-700 opacity-70"
                  data-testid="input-species-sizebonus"
                />
              </div>

              <div>
                <Label>Starting HP</Label>
                <Input
                  type="number"
                  value={formData.startingHp}
                  onChange={(e) => handleNumericChange('startingHp', e.target.value)}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-species-startinghp"
                />
              </div>

              <div>
                <Label>Starting Max HP</Label>
                <Input
                  type="number"
                  value={formData.startingMaxHp}
                  onChange={(e) => handleNumericChange('startingMaxHp', e.target.value)}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-species-startingmaxhp"
                />
              </div>

              <div>
                <Label>HP Per Level</Label>
                <Input
                  type="number"
                  value={formData.hpPerLevel}
                  onChange={(e) => handleNumericChange('hpPerLevel', e.target.value)}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-species-hpperlevel"
                />
              </div>

              <div>
                <Label>Starting Energy</Label>
                <Input
                  type="number"
                  value={formData.startingEnergy}
                  onChange={(e) => handleNumericChange('startingEnergy', e.target.value)}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-species-startingenergy"
                />
              </div>

              <div>
                <Label>Starting Max Energy</Label>
                <Input
                  type="number"
                  value={formData.startingMaxEnergy}
                  onChange={(e) => handleNumericChange('startingMaxEnergy', e.target.value)}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-species-startingmaxenergy"
                />
              </div>

              <div>
                <Label>Base Carry Weight</Label>
                <Input
                  type="number"
                  value={formData.carryWeight}
                  onChange={(e) => handleNumericChange('carryWeight', e.target.value)}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-species-carryweight"
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
    quantity: number | string;
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
    breakChance: number | string;
    itemWeight: number | string;
    price: number | string;
    currency: string;
    durability: number | string;
    isContainer: boolean;
    carryCapacity: number | string;
    armorSlot: string;
    armorBonus: number | string;
    damageReduction: number | string;
    damageReductionType: string;
    rationServings: number | string;
  }>({
    name: initialData?.name || '',
    image: initialData?.image || '',
    description: initialData?.description || '',
    rules: '',
    rulesVisible: true,
    itemType: initialData?.itemType || 'utility',
    rarity: initialData?.rarity || 'common',
    quantity: initialData?.quantity ?? '',
    damage: initialData?.damage || '',
    damageType: initialData?.damageType || '',
    mod: initialData?.mod ?? '',
    range: initialData?.range ?? '',
    aoe: initialData?.aoe || 'none',
    attribute: initialData?.attribute || '',
    size: initialData?.size || '',
    isHeavy: (initialData as any)?.isHeavy || false,
    ammunitionType: (initialData as any)?.ammunitionType || '',
    weaponCategory: (initialData as any)?.weaponCategory || '',
    breakChance: (initialData as any)?.breakChance ?? '',
    itemWeight: initialData?.itemWeight ?? '',
    price: '',
    currency: 'copper',
    durability: initialData?.durability ?? '',
    isContainer: initialData?.isContainer || false,
    carryCapacity: initialData?.carryCapacity ?? '',
    armorSlot: (initialData as any)?.armorSlot || '',
    armorBonus: (initialData as any)?.armorBonus ?? '',
    damageReduction: (initialData as any)?.damageReduction ?? '',
    damageReductionType: (initialData as any)?.damageReductionType || '',
    rationServings: (initialData as any)?.rationServings ?? '',
  });
  
  const [showImageBrowser, setShowImageBrowser] = useState(false);
  
  const handleItemNumericChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value === '' ? '' : parseInt(value) });
  };

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
      breakChance: formData.itemType === 'ammunition' ? Number(formData.breakChance) || 10 : 10,
      aoe: formData.aoe === 'none' ? undefined : formData.aoe,
      armorBonus: formData.itemType === 'armor' ? Number(formData.armorBonus) || 0 : 0,
      damageReduction: formData.itemType === 'armor' ? Number(formData.damageReduction) || 0 : 0,
      armorSlot: formData.itemType === 'armor' ? formData.armorSlot : undefined,
      damageReductionType: formData.itemType === 'armor' ? formData.damageReductionType : undefined,
      rationServings: formData.itemType === 'consumable' ? Number(formData.rationServings) || 0 : 0,
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
                  <div className="flex gap-2">
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
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowImageBrowser(true)}
                      className="border-stone-600"
                      data-testid="button-browse-library"
                    >
                      <Library className="h-4 w-4 mr-1" />
                      Libraries
                    </Button>
                  </div>
                </div>
              </div>

              <ImageBrowser
                open={showImageBrowser}
                onOpenChange={setShowImageBrowser}
                onSelect={(imageBase64) => {
                  setFormData({ ...formData, image: imageBase64 });
                  setShowImageBrowser(false);
                }}
                title="Select Item Image"
              />

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
                    <Label>Break Chance: {Number(formData.breakChance) || 10}%</Label>
                    <Slider
                      value={[Number(formData.breakChance) || 10]}
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
                      value={formData.mod}
                      onChange={(e) => handleItemNumericChange('mod', e.target.value)}
                      className="bg-stone-800 border-stone-700"
                      data-testid="input-modifier"
                    />
                  </div>
                  <div>
                    <Label>Range (ft)</Label>
                    <Input
                      type="number"
                      value={formData.range}
                      onChange={(e) => handleItemNumericChange('range', e.target.value)}
                      className="bg-stone-800 border-stone-700"
                      data-testid="input-range"
                    />
                  </div>
                </>
              )}

              {formData.itemType === 'consumable' && (
                <div className="col-span-2">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={Number(formData.rationServings) > 0}
                        onCheckedChange={(checked) => setFormData({ ...formData, rationServings: checked ? 1 : 0 })}
                        data-testid="checkbox-ration"
                      />
                      <Label>Is Ration</Label>
                    </div>
                    {Number(formData.rationServings) > 0 && (
                      <div className="flex items-center gap-2">
                        <Label>Servings:</Label>
                        <Input
                          type="number"
                          min={1}
                          value={formData.rationServings}
                          onChange={(e) => setFormData({ ...formData, rationServings: e.target.value === '' ? '' : parseInt(e.target.value) || 1 })}
                          className="bg-stone-800 border-stone-700 w-20"
                          data-testid="input-ration-servings"
                        />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-stone-500 mt-1">Ration items are consumed during rest. Each serving counts as 1 ration (Short Rest needs 2, Long Rest needs 4)</p>
                </div>
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

              {formData.itemType === 'armor' && (
                <>
                  <div>
                    <Label>Armor Slot</Label>
                    <Select value={formData.armorSlot} onValueChange={(v) => setFormData({ ...formData, armorSlot: v })}>
                      <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-armor-slot">
                        <SelectValue placeholder="Select slot" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="helm">Helm</SelectItem>
                        <SelectItem value="chest">Chest</SelectItem>
                        <SelectItem value="arm">Arm</SelectItem>
                        <SelectItem value="legs">Legs</SelectItem>
                        <SelectItem value="boots">Boots</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>DC Armor Bonus</Label>
                    <Input
                      type="number"
                      value={formData.armorBonus}
                      onChange={(e) => handleItemNumericChange('armorBonus', e.target.value)}
                      className="bg-stone-800 border-stone-700"
                      placeholder="Added to character DC"
                      data-testid="input-armor-bonus"
                    />
                    <p className="text-xs text-stone-500 mt-1">Directly added to character's DC when equipped</p>
                  </div>
                  <div>
                    <Label>Damage Reduction Type</Label>
                    <Select value={formData.damageReductionType} onValueChange={(v) => setFormData({ ...formData, damageReductionType: v })}>
                      <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-damage-reduction-type">
                        <SelectValue placeholder="Select damage type" />
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
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Damage Reduction Value</Label>
                    <Input
                      type="number"
                      value={formData.damageReduction}
                      onChange={(e) => handleItemNumericChange('damageReduction', e.target.value)}
                      className="bg-stone-800 border-stone-700"
                      placeholder="Amount reduced"
                      data-testid="input-damage-reduction"
                    />
                    <p className="text-xs text-stone-500 mt-1">HP damage reduced when hit by matching damage type</p>
                  </div>
                </>
              )}

              <div>
                <Label>Weight (lbs)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.itemWeight}
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
                  value={formData.durability}
                  onChange={(e) => setFormData({ ...formData, durability: e.target.value === '' ? '' : Math.min(10, Math.max(0, parseInt(e.target.value))) })}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-durability"
                />
              </div>

              <div>
                <Label>Price</Label>
                <Input
                  type="number"
                  value={formData.price}
                  onChange={(e) => handleItemNumericChange('price', e.target.value)}
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
                        value={formData.carryCapacity}
                        onChange={(e) => handleItemNumericChange('carryCapacity', e.target.value)}
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
