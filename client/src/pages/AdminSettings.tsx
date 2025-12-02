import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, useMotionValue } from 'framer-motion';
import { api, type Item, type SystemSpecies, type FeatTree, type Feat, type FeatConnection, type FeatTreeWithData, type FeatTemplate, type SystemSpell } from '@/lib/api';
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
import { ArrowLeft, Plus, Pencil, Trash2, Sword, Shield, Package, Sparkles, Box, Coins, Search, Users, GitBranch, Library, Link, X, GripVertical, Star, Zap, Heart, ShieldCheck, BookOpen, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import { ImageBrowser } from '@/components/ImageBrowser';

type AdminView = 'dashboard' | 'items' | 'species' | 'spells' | 'feat-trees';

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

  const [showAddSpell, setShowAddSpell] = useState(false);
  const [editingSpell, setEditingSpell] = useState<SystemSpell | null>(null);
  const [spellSearchQuery, setSpellSearchQuery] = useState('');

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

  const { data: systemSpells = [], isLoading: spellsLoading } = useQuery({
    queryKey: ['system-spells'],
    queryFn: () => api.getSystemSpells(),
    enabled: isAdmin && currentView === 'spells',
  });

  const { data: allFeatTrees = [] } = useQuery({
    queryKey: ['feat-trees'],
    queryFn: () => api.getFeatTrees(),
    enabled: isAdmin,
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

  const createSpellMutation = useMutation({
    mutationFn: (spell: Partial<SystemSpell>) => api.createSystemSpell(spell),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-spells'] });
      setShowAddSpell(false);
      toast({ title: 'Spell Created', description: 'Spell created successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateSpellMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<SystemSpell> }) => api.updateSystemSpell(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-spells'] });
      setEditingSpell(null);
      toast({ title: 'Spell Updated', description: 'Spell updated successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteSpellMutation = useMutation({
    mutationFn: (id: string) => api.deleteSystemSpell(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-spells'] });
      toast({ title: 'Spell Deleted', description: 'Spell deleted successfully' });
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
  const debouncedSpellSearchQuery = useDebouncedValue(spellSearchQuery, 150);
  
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

  const filteredSpells = useMemo(() => {
    return systemSpells.filter((spell: SystemSpell) => {
      return spell.name.toLowerCase().includes(debouncedSpellSearchQuery.toLowerCase()) ||
             (spell.description?.toLowerCase().includes(debouncedSpellSearchQuery.toLowerCase())) ||
             spell.school.toLowerCase().includes(debouncedSpellSearchQuery.toLowerCase());
    });
  }, [systemSpells, debouncedSpellSearchQuery]);

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
               currentView === 'species' ? 'Species / Races' : 
               currentView === 'spells' ? 'Spells' : 'Feat Trees'}
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

        {currentView === 'spells' && (
          <SpellsView
            spells={filteredSpells}
            isLoading={spellsLoading}
            searchQuery={spellSearchQuery}
            setSearchQuery={setSpellSearchQuery}
            onAddSpell={() => setShowAddSpell(true)}
            onEditSpell={setEditingSpell}
            onDeleteSpell={(id) => {
              if (confirm('Are you sure you want to delete this spell?')) {
                deleteSpellMutation.mutate(id);
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
          featTrees={allFeatTrees}
        />

        {editingSpecies && (
          <SpeciesFormDialog
            open={!!editingSpecies}
            onOpenChange={() => setEditingSpecies(null)}
            onSave={(data) => updateSpeciesMutation.mutate({ id: editingSpecies.id, data })}
            initialData={editingSpecies}
            isLoading={updateSpeciesMutation.isPending}
            featTrees={allFeatTrees}
          />
        )}

        <SpellFormDialog
          open={showAddSpell}
          onOpenChange={setShowAddSpell}
          onSave={(data) => createSpellMutation.mutate(data)}
          isLoading={createSpellMutation.isPending}
        />

        {editingSpell && (
          <SpellFormDialog
            open={!!editingSpell}
            onOpenChange={() => setEditingSpell(null)}
            onSave={(data) => updateSpellMutation.mutate({ id: editingSpell.id, data })}
            initialData={editingSpell}
            isLoading={updateSpellMutation.isPending}
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
        onClick={() => onNavigate('spells')}
        data-testid="card-system-spells"
      >
        <CardHeader>
          <div className="h-12 w-12 rounded-lg bg-blue-700/20 flex items-center justify-center mb-2">
            <Sparkles className="h-6 w-6 text-blue-500" />
          </div>
          <CardTitle className="text-blue-500">System Spells</CardTitle>
          <CardDescription className="text-stone-400">
            Define spells that can be learned or granted through feats
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

interface SpellsViewProps {
  spells: SystemSpell[];
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onAddSpell: () => void;
  onEditSpell: (spell: SystemSpell) => void;
  onDeleteSpell: (id: string) => void;
}

const spellSchoolColors: Record<string, string> = {
  Evocation: 'bg-red-600',
  Conjuration: 'bg-yellow-600',
  Abjuration: 'bg-blue-600',
  Transmutation: 'bg-green-600',
  Divination: 'bg-purple-600',
  Enchantment: 'bg-pink-600',
  Illusion: 'bg-indigo-600',
  Necromancy: 'bg-gray-600',
};

function SpellsView({ spells, isLoading, searchQuery, setSearchQuery, onAddSpell, onEditSpell, onDeleteSpell }: SpellsViewProps) {
  return (
    <Card className="bg-stone-900 border-stone-700">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-blue-500">System Spells</CardTitle>
        <Button
          onClick={onAddSpell}
          className="bg-blue-700 hover:bg-blue-600"
          data-testid="button-add-spell"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Spell
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
            <Input
              placeholder="Search spells..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-stone-800 border-stone-700"
              data-testid="input-search-spells"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-stone-400">Loading spells...</div>
        ) : spells.length === 0 ? (
          <div className="text-center py-12 text-stone-400">
            <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-bold">No spells found</p>
            <p className="text-sm mt-2">Create spells that can be granted through feats</p>
          </div>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="space-y-2">
              {spells.map((spell: SystemSpell) => (
                <div
                  key={spell.id}
                  className="flex items-center gap-4 p-3 rounded-lg bg-stone-800 border border-stone-700 hover:border-stone-600"
                  data-testid={`spell-row-${spell.id}`}
                >
                  <div className="h-12 w-12 rounded bg-stone-700 flex items-center justify-center">
                    <Sparkles className="h-6 w-6 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{spell.name}</span>
                      <Badge className={`${spellSchoolColors[spell.school] || 'bg-stone-600'} text-xs`}>{spell.school}</Badge>
                      <Badge className="bg-stone-600 text-xs">Lvl {spell.level}</Badge>
                    </div>
                    <div className="text-sm text-stone-400 flex flex-wrap gap-2">
                      <span>Range: {spell.range}</span>
                      <span>| {spell.castingTime}</span>
                      {spell.damageDice && <span>| Damage: {spell.damageDice} {spell.damageType}</span>}
                      {spell.concentration && <span>| Concentration</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEditSpell(spell)}
                      className="text-stone-400 hover:text-blue-500"
                      data-testid={`button-edit-spell-${spell.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDeleteSpell(spell.id)}
                      className="text-stone-400 hover:text-red-500"
                      data-testid={`button-delete-spell-${spell.id}`}
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

// Feat node styling (uniform style without tiers)
const featNodeStyle = {
  border: 'border-purple-600',
  bg: 'bg-gradient-to-br from-purple-900/90 to-stone-900/90',
  glow: 'shadow-[0_0_15px_rgba(147,51,234,0.4)]',
};

const effectTypeIcons: Record<string, any> = {
  hp_bonus: Heart,
  dc_bonus: ShieldCheck,
  spell_grant: BookOpen,
  skill_bonus: Star,
  attribute_bonus: Zap,
};

const NODE_WIDTH = 160;
const NODE_HEIGHT = 100;

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

  // Selection and dragging state
  const [selectedFeatId, setSelectedFeatId] = useState<string | null>(null);
  const [connectionMode, setConnectionMode] = useState(false);
  const [featActionMenu, setFeatActionMenu] = useState<string | null>(null); // featId for centered popup
  const draggingRef = useRef<{ featId: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ id: string; dx: number; dy: number } | null>(null);

  // Handle feat node click
  const handleFeatClick = (feat: Feat, e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    
    if (connectionMode && connectingFrom) {
      // Complete connection
      if (connectingFrom !== feat.id) {
        createConnectionMutation.mutate({
          treeId: selectedTreeId!,
          connection: { fromFeatId: connectingFrom, toFeatId: feat.id, isOptional: false },
        });
      }
      setConnectingFrom(null);
    } else if (connectionMode) {
      // Start connection
      setConnectingFrom(feat.id);
    } else {
      // Select feat
      setSelectedFeatId(feat.id);
    }
  };

  // Handle feat node double click - open centered action menu
  const handleFeatDoubleClick = (feat: Feat, e: React.MouseEvent) => {
    e.stopPropagation();
    setFeatActionMenu(feat.id);
    setSelectedFeatId(feat.id);
  };

  // Handle right-click - also open centered action menu
  const handleFeatContextMenu = (feat: Feat, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFeatActionMenu(feat.id);
    setSelectedFeatId(feat.id);
  };

  // Handle canvas click (deselect)
  const handleCanvasClick = () => {
    if (!draggingRef.current) {
      setSelectedFeatId(null);
      if (connectionMode) {
        setConnectingFrom(null);
      }
    }
    setFeatActionMenu(null);
  };

  // Drag handlers for feat nodes
  const handleFeatPointerDown = (feat: Feat, e: React.PointerEvent) => {
    if (connectionMode) return;
    
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    
    draggingRef.current = {
      featId: feat.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: feat.gridX * CELL_SIZE,
      origY: feat.gridY * CELL_SIZE,
    };
  };

  const handleFeatPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    
    const zoom = zoomRef.current;
    const dx = (e.clientX - draggingRef.current.startX) / zoom;
    const dy = (e.clientY - draggingRef.current.startY) / zoom;
    
    setDragOffset({ id: draggingRef.current.featId, dx, dy });
  };

  const handleFeatPointerUp = (feat: Feat, e: React.PointerEvent) => {
    if (!draggingRef.current || draggingRef.current.featId !== feat.id) return;
    
    const zoom = zoomRef.current;
    const dx = (e.clientX - draggingRef.current.startX) / zoom;
    const dy = (e.clientY - draggingRef.current.startY) / zoom;
    
    // Only save if moved significantly
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      const newX = draggingRef.current.origX + dx;
      const newY = draggingRef.current.origY + dy;
      
      updateFeatMutation.mutate({
        id: feat.id,
        data: { 
          gridX: Math.round(newX / CELL_SIZE),
          gridY: Math.round(newY / CELL_SIZE),
        },
      });
    }
    
    draggingRef.current = null;
    setDragOffset(null);
    
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  // Add new feat at center of viewport
  const handleAddFeat = () => {
    const zoom = zoomRef.current;
    const pan = panRef.current;
    
    // Calculate world position at viewport center (in pixels), then convert to grid indices
    const centerX = Math.round((viewportSize.width / 2 - pan.x) / zoom);
    const centerY = Math.round((viewportSize.height / 2 - pan.y) / zoom);
    
    setEditingFeat({ 
      gridX: Math.round(centerX / CELL_SIZE), 
      gridY: Math.round(centerY / CELL_SIZE), 
      tier: 1, 
      cost: 1 
    } as Feat);
    setShowFeatEditor(true);
  };

  // Infinite canvas state - use refs to avoid re-renders during pan/zoom
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const [, forceUpdate] = useState(0);
  
  // Motion values for smooth updates without re-renders
  const motionX = useMotionValue(0);
  const motionY = useMotionValue(0);
  const motionZoom = useMotionValue(1);
  
  // Gesture state
  type GestureMode = 'idle' | 'panning' | 'pinching';
  const gestureModeRef = useRef<GestureMode>('idle');
  const panStartRef = useRef<{ pointerX: number; pointerY: number; panX: number; panY: number } | null>(null);
  const panPointerIdRef = useRef<number | null>(null);
  const lastTouchDistanceRef = useRef<number | null>(null);
  const [isPinching, setIsPinching] = useState(false);
  
  // Track viewport size
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  
  // Cell size for the grid (must match the old system's grid cell size for backward compatibility)
  const CELL_SIZE = 100;
  const WORLD_SIZE = 20000;
  const WORLD_OFFSET = 10000;

  // Track viewport with ResizeObserver
  useEffect(() => {
    if (!canvasContainerRef.current) return;
    
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setViewportSize(prev => {
            if (prev.width !== width || prev.height !== height) {
              return { width, height };
            }
            return prev;
          });
        }
      }
    });
    
    observer.observe(canvasContainerRef.current);
    return () => observer.disconnect();
  }, [selectedTreeId]);

  // Reset view when tree changes
  useEffect(() => {
    if (selectedTreeId && viewportSize.width > 0) {
      // Center on origin (0,0)
      // The motion.div has left:-WORLD_OFFSET, and cells are at WORLD_OFFSET + gridX*CELL_SIZE
      // Final screen position = gridX * CELL_SIZE + panX (the offsets cancel out)
      // For origin (0,0) to be at viewport center: panX = viewportWidth/2
      const centerX = viewportSize.width / 2;
      const centerY = viewportSize.height / 2;
      panRef.current = { x: centerX, y: centerY };
      zoomRef.current = 1;
      motionX.set(centerX);
      motionY.set(centerY);
      motionZoom.set(1);
      forceUpdate(n => n + 1);
    }
  }, [selectedTreeId, viewportSize.width]);

  // Wheel zoom handler
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container || !selectedTreeId) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      if (gestureModeRef.current !== 'idle' && gestureModeRef.current !== 'panning') return;
      
      const currentZoom = zoomRef.current;
      const currentPan = panRef.current;
      
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const delta = -e.deltaY * 0.002;
      const newZoom = Math.max(0.3, Math.min(3, currentZoom + delta));
      
      if (Math.abs(newZoom - currentZoom) > 0.001) {
        // Zoom towards cursor
        const worldX = ((mouseX + WORLD_OFFSET - currentPan.x) / currentZoom) - WORLD_OFFSET;
        const worldY = ((mouseY + WORLD_OFFSET - currentPan.y) / currentZoom) - WORLD_OFFSET;
        
        const newPan = {
          x: mouseX + WORLD_OFFSET - (worldX + WORLD_OFFSET) * newZoom,
          y: mouseY + WORLD_OFFSET - (worldY + WORLD_OFFSET) * newZoom
        };
        
        panRef.current = newPan;
        zoomRef.current = newZoom;
        motionX.set(newPan.x);
        motionY.set(newPan.y);
        motionZoom.set(newZoom);
        forceUpdate(n => n + 1);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [selectedTreeId, motionX, motionY, motionZoom]);

  // Touch pinch-to-zoom handler
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container || !selectedTreeId) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        if (gestureModeRef.current === 'panning') {
          gestureModeRef.current = 'idle';
          panPointerIdRef.current = null;
          panStartRef.current = null;
        }
        gestureModeRef.current = 'pinching';
        setIsPinching(true);
      } else if (e.touches.length === 1) {
        setIsPinching(false);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        gestureModeRef.current = 'pinching';
        setIsPinching(true);
        
        const currentZoom = zoomRef.current;
        const currentPan = panRef.current;
        
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );

        const rect = container.getBoundingClientRect();
        const centerX = ((touch1.clientX + touch2.clientX) / 2) - rect.left;
        const centerY = ((touch1.clientY + touch2.clientY) / 2) - rect.top;

        if (lastTouchDistanceRef.current !== null) {
          const delta = (distance - lastTouchDistanceRef.current) * 0.01;
          const newZoom = Math.max(0.3, Math.min(3, currentZoom + delta));
          
          if (Math.abs(newZoom - currentZoom) > 0.001) {
            const worldX = ((centerX + WORLD_OFFSET - currentPan.x) / currentZoom) - WORLD_OFFSET;
            const worldY = ((centerY + WORLD_OFFSET - currentPan.y) / currentZoom) - WORLD_OFFSET;
            
            const newPan = {
              x: centerX + WORLD_OFFSET - (worldX + WORLD_OFFSET) * newZoom,
              y: centerY + WORLD_OFFSET - (worldY + WORLD_OFFSET) * newZoom
            };
            
            panRef.current = newPan;
            zoomRef.current = newZoom;
            motionX.set(newPan.x);
            motionY.set(newPan.y);
            motionZoom.set(newZoom);
            forceUpdate(n => n + 1);
          }
        }
        lastTouchDistanceRef.current = distance;
      }
    };

    const handleTouchEnd = () => {
      lastTouchDistanceRef.current = null;
      if (gestureModeRef.current === 'pinching') {
        gestureModeRef.current = 'idle';
        setIsPinching(false);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [selectedTreeId]);

  // Pointer handlers for panning
  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (isPinching) return;
    if (gestureModeRef.current !== 'idle') return;
    
    // Only pan with left mouse button or touch
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    
    // Don't start pan if clicking on a feat
    const target = e.target as HTMLElement;
    if (target.closest('[data-feat-cell]')) return;
    
    gestureModeRef.current = 'panning';
    panPointerIdRef.current = e.pointerId;
    panStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y
    };
    
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent) => {
    if (gestureModeRef.current !== 'panning') return;
    if (panPointerIdRef.current !== e.pointerId) return;
    if (!panStartRef.current) return;
    
    const dx = e.clientX - panStartRef.current.pointerX;
    const dy = e.clientY - panStartRef.current.pointerY;
    
    const newPan = {
      x: panStartRef.current.panX + dx,
      y: panStartRef.current.panY + dy
    };
    
    panRef.current = newPan;
    motionX.set(newPan.x);
    motionY.set(newPan.y);
  };

  const handleCanvasPointerUp = (e: React.PointerEvent) => {
    if (panPointerIdRef.current === e.pointerId) {
      gestureModeRef.current = 'idle';
      panPointerIdRef.current = null;
      panStartRef.current = null;
      
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (err) {}
    }
  };

  const resetView = () => {
    if (viewportSize.width > 0 && treeData) {
      // Center on the first feat, or origin if no feats
      let targetX = 0;
      let targetY = 0;
      
      if (treeData.feats && treeData.feats.length > 0) {
        // Find the first feat (by order in array)
        const firstFeat = treeData.feats[0];
        targetX = firstFeat.gridX * CELL_SIZE;
        targetY = firstFeat.gridY * CELL_SIZE;
      }
      
      // Calculate pan to center target in viewport
      const centerX = viewportSize.width / 2 - targetX;
      const centerY = viewportSize.height / 2 - targetY;
      
      panRef.current = { x: centerX, y: centerY };
      zoomRef.current = 1;
      motionX.set(centerX);
      motionY.set(centerY);
      motionZoom.set(1);
      forceUpdate(n => n + 1);
    }
  };

  // Helper to generate bezier curve path between two points
  const generateCurvePath = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const curvature = Math.min(distance * 0.3, 100);
    
    // Control points for bezier curve
    const cx1 = x1 + dx * 0.25;
    const cy1 = y1 + curvature * (dy > 0 ? 0.5 : -0.5);
    const cx2 = x2 - dx * 0.25;
    const cy2 = y2 - curvature * (dy > 0 ? 0.5 : -0.5);
    
    return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
  };

  const renderSkillTree = () => {
    if (!treeData) return null;
    
    const { feats, connections } = treeData;
    const featById = new Map<string, Feat>();
    feats.forEach((f: Feat) => featById.set(f.id, f));

    return (
      <div 
        ref={canvasContainerRef}
        className={`relative w-full h-[600px] overflow-hidden rounded-lg border border-stone-700 ${
          connectionMode ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
        }`}
        style={{ 
          touchAction: 'none',
          background: 'radial-gradient(ellipse at center, #1c1917 0%, #0c0a09 100%)'
        }}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerUp}
        onClick={handleCanvasClick}
      >
        {/* Toolbar */}
        <div className="absolute top-3 left-3 z-30 flex gap-2">
          <Button 
            size="sm" 
            onClick={handleAddFeat}
            className="bg-purple-600 hover:bg-purple-700 text-xs"
            data-testid="add-feat-canvas-button"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Feat
          </Button>
          <Button 
            size="sm" 
            variant={connectionMode ? "default" : "secondary"}
            onClick={() => {
              setConnectionMode(!connectionMode);
              if (!connectionMode) setConnectingFrom(null);
            }}
            className={connectionMode 
              ? "bg-purple-600 hover:bg-purple-700 text-xs animate-pulse" 
              : "bg-stone-700 hover:bg-stone-600 text-xs border border-stone-600"
            }
          >
            <Link className="h-3 w-3 mr-1" />
            {connectionMode ? 'Exit Connection Mode' : 'Connect'}
          </Button>
          <Button 
            size="sm" 
            variant="secondary" 
            className="bg-stone-800/80 hover:bg-stone-700 text-xs border border-stone-600 ml-2"
            onClick={resetView}
            title="Center on first feat"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>

        {/* Connection mode indicator */}
        {connectionMode && (
          <div className="absolute top-3 right-3 z-30 flex items-center gap-2 bg-purple-600/90 backdrop-blur px-3 py-1.5 rounded-lg text-sm shadow-lg">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <span>{connectingFrom ? 'Click target feat to connect' : 'Click source feat to start'}</span>
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-6 w-6 p-0 hover:bg-purple-500"
              onClick={() => {
                setConnectionMode(false);
                setConnectingFrom(null);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        
        {/* Infinite canvas world */}
        <motion.div
          className="absolute"
          style={{
            x: motionX,
            y: motionY,
            scale: motionZoom,
            width: WORLD_SIZE,
            height: WORLD_SIZE,
            left: -WORLD_OFFSET,
            top: -WORLD_OFFSET,
            transformOrigin: '0 0'
          }}
        >
          {/* Subtle grid pattern */}
          <div 
            className="absolute inset-0 pointer-events-none opacity-30"
            style={{
              backgroundImage: `
                radial-gradient(circle at center, rgba(168,85,247,0.1) 0%, transparent 70%),
                linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
              `,
              backgroundSize: `100% 100%, 50px 50px, 50px 50px`,
              backgroundPosition: `center, ${WORLD_OFFSET}px ${WORLD_OFFSET}px, ${WORLD_OFFSET}px ${WORLD_OFFSET}px`
            }}
          />
          
          {/* Connection lines SVG */}
          <svg 
            className="absolute pointer-events-none"
            style={{ 
              width: WORLD_SIZE, 
              height: WORLD_SIZE,
              left: 0,
              top: 0
            }}
          >
            <defs>
              <marker id="arrowhead-skill" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto">
                <polygon points="0 0, 12 4, 0 8" fill="url(#arrow-gradient)" />
              </marker>
              <linearGradient id="arrow-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#a855f7" />
                <stop offset="100%" stopColor="#eab308" />
              </linearGradient>
              <linearGradient id="line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#a855f7" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#eab308" stopOpacity="0.8" />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            {connections.map((conn: FeatConnection) => {
              const from = featById.get(conn.fromFeatId);
              const to = featById.get(conn.toFeatId);
              if (!from || !to) return null;
              
              // Convert grid indices to pixels and apply drag offset if node is being dragged
              let fromX = from.gridX * CELL_SIZE;
              let fromY = from.gridY * CELL_SIZE;
              let toX = to.gridX * CELL_SIZE;
              let toY = to.gridY * CELL_SIZE;
              
              if (dragOffset?.id === from.id) {
                fromX += dragOffset.dx;
                fromY += dragOffset.dy;
              }
              if (dragOffset?.id === to.id) {
                toX += dragOffset.dx;
                toY += dragOffset.dy;
              }
              
              const x1 = WORLD_OFFSET + fromX + NODE_WIDTH / 2;
              const y1 = WORLD_OFFSET + fromY + NODE_HEIGHT / 2;
              const x2 = WORLD_OFFSET + toX + NODE_WIDTH / 2;
              const y2 = WORLD_OFFSET + toY + NODE_HEIGHT / 2;
              
              const pathD = generateCurvePath(x1, y1, x2, y2);
              const midX = (x1 + x2) / 2;
              const midY = (y1 + y2) / 2;
              
              return (
                <g key={conn.id} filter="url(#glow)">
                  <path
                    d={pathD}
                    fill="none"
                    stroke="url(#line-gradient)"
                    strokeWidth={3}
                    markerEnd="url(#arrowhead-skill)"
                    className="transition-all"
                  />
                  <circle
                    cx={midX}
                    cy={midY}
                    r={10}
                    fill="#1c1917"
                    stroke="#78716c"
                    strokeWidth={1}
                    className="cursor-pointer pointer-events-auto hover:stroke-red-500 hover:fill-red-900/50 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConnectionMutation.mutate(conn.id);
                    }}
                  />
                  <text
                    x={midX}
                    y={midY + 4}
                    textAnchor="middle"
                    className="fill-red-400 pointer-events-none text-xs font-bold"
                  >
                    ×
                  </text>
                </g>
              );
            })}
          </svg>
          
          {/* Feat nodes - free-form placement */}
          {feats.map((feat: Feat) => {
            const isSelected = selectedFeatId === feat.id;
            const isConnectSource = connectingFrom === feat.id;
            
            // Convert grid indices to pixels and apply drag offset
            let posX = feat.gridX * CELL_SIZE;
            let posY = feat.gridY * CELL_SIZE;
            if (dragOffset?.id === feat.id) {
              posX += dragOffset.dx;
              posY += dragOffset.dy;
            }
            
            return (
              <div
                key={feat.id}
                data-feat-cell
                className={`
                  absolute rounded-xl border-2 transition-all duration-200
                  ${featNodeStyle.border} ${featNodeStyle.bg} ${featNodeStyle.glow}
                  ${isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-stone-900 scale-105' : ''}
                  ${isConnectSource ? 'animate-pulse ring-2 ring-purple-400' : ''}
                  ${connectionMode ? 'cursor-crosshair' : 'cursor-move'}
                  hover:scale-105
                `}
                style={{
                  left: WORLD_OFFSET + posX,
                  top: WORLD_OFFSET + posY,
                  width: NODE_WIDTH,
                  height: NODE_HEIGHT,
                }}
                onClick={(e) => handleFeatClick(feat, e)}
                onDoubleClick={(e) => handleFeatDoubleClick(feat, e)}
                onContextMenu={(e) => handleFeatContextMenu(feat, e)}
                onPointerDown={(e) => handleFeatPointerDown(feat, e)}
                onPointerMove={handleFeatPointerMove}
                onPointerUp={(e) => handleFeatPointerUp(feat, e)}
                data-testid={`feat-node-${feat.id}`}
              >
                <div className="h-full flex flex-col items-center justify-center p-2 text-center overflow-hidden">
                  <div className="text-sm font-bold text-white truncate w-full drop-shadow-lg">
                    {feat.name}
                  </div>
                  {feat.description && (
                    <div className="text-[10px] text-stone-300 mt-1 line-clamp-2 w-full leading-tight">
                      {feat.description}
                    </div>
                  )}
                  {(feat.effects as any[])?.length > 0 && (
                    <div className="flex gap-0.5 mt-1">
                      {(feat.effects as any[]).slice(0, 3).map((effect: any, idx: number) => {
                        const Icon = effectTypeIcons[effect.type] || Star;
                        return <Icon key={idx} className="h-3 w-3 text-white/70" />;
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          
          {/* Origin marker */}
          <div 
            className="absolute w-4 h-4 bg-purple-500/50 rounded-full border-2 border-purple-400"
            style={{
              left: WORLD_OFFSET - 8,
              top: WORLD_OFFSET - 8
            }}
            title="Origin (0,0)"
          />
        </motion.div>

        {/* Centered Feat Action Menu */}
        {featActionMenu && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={() => setFeatActionMenu(null)}
          >
            <div
              className="bg-stone-800 border border-stone-600 rounded-xl shadow-2xl p-4 min-w-[220px] transform"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-4">
                <h3 className="font-display text-lg text-amber-500">
                  {featById.get(featActionMenu)?.name || 'Feat Actions'}
                </h3>
                {featById.get(featActionMenu)?.description && (
                  <p className="text-xs text-stone-400 mt-1 line-clamp-2">
                    {featById.get(featActionMenu)?.description}
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <button
                  className="w-full px-4 py-3 rounded-lg bg-stone-700 hover:bg-purple-700 transition-colors flex items-center gap-3 text-stone-200"
                  onClick={() => {
                    const feat = featById.get(featActionMenu);
                    if (feat) {
                      setEditingFeat(feat);
                      setShowFeatEditor(true);
                    }
                    setFeatActionMenu(null);
                  }}
                >
                  <Pencil className="h-5 w-5 text-purple-400" />
                  <span>Edit Feat</span>
                </button>
                
                <button
                  className="w-full px-4 py-3 rounded-lg bg-stone-700 hover:bg-blue-700 transition-colors flex items-center gap-3 text-stone-200"
                  onClick={() => {
                    setConnectionMode(true);
                    setConnectingFrom(featActionMenu);
                    setFeatActionMenu(null);
                  }}
                >
                  <Link className="h-5 w-5 text-blue-400" />
                  <span>Start Connection</span>
                </button>
                
                <div className="border-t border-stone-600 my-2" />
                
                <button
                  className="w-full px-4 py-3 rounded-lg bg-red-900/30 hover:bg-red-700 transition-colors flex items-center gap-3 text-red-400 hover:text-white"
                  onClick={() => {
                    if (confirm('Delete this feat? This cannot be undone.')) {
                      deleteFeatMutation.mutate(featActionMenu);
                    }
                    setFeatActionMenu(null);
                  }}
                >
                  <Trash2 className="h-5 w-5" />
                  <span>Delete Feat</span>
                </button>
              </div>
              
              <button
                className="w-full mt-4 px-4 py-2 rounded-lg border border-stone-600 hover:bg-stone-700 transition-colors text-stone-400 text-sm"
                onClick={() => setFeatActionMenu(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
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
                      {tree.description || 'No description'}
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
      <CardContent className="p-0 sm:p-2">
        {treeDataLoading ? (
          <div className="text-center py-12 text-stone-400">Loading tree...</div>
        ) : (
          <div className="space-y-2">
            <div className="px-4 py-2 text-xs text-stone-500 border-b border-stone-800">
              <span className="font-medium">Tips:</span> Drag nodes to reposition • Double-click to edit • Right-click for menu • Scroll to zoom • Drag canvas to pan
            </div>
            {renderSkillTree()}
          </div>
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

const SKILLS_LIST = [
  { key: 'skillAgility', name: 'Agility' },
  { key: 'skillStrength', name: 'Strength' },
  { key: 'skillStealth', name: 'Stealth' },
  { key: 'skillSleightOfHand', name: 'Sleight of Hand' },
  { key: 'skillArcana', name: 'Arcana' },
  { key: 'skillConcentration', name: 'Concentration' },
  { key: 'skillWisdom', name: 'Wisdom' },
  { key: 'skillInvestigation', name: 'Investigation' },
  { key: 'skillPerception', name: 'Perception' },
  { key: 'skillMedicine', name: 'Medicine' },
  { key: 'skillHistory', name: 'History' },
  { key: 'skillCharisma', name: 'Charisma' },
  { key: 'skillDeception', name: 'Deception' },
  { key: 'skillIntimidation', name: 'Intimidation' },
  { key: 'skillCulture', name: 'Culture' },
  { key: 'skillSurvival', name: 'Survival' },
  { key: 'skillBeastHandling', name: 'Beast Handling' },
];

const ATTRIBUTES_LIST = [
  { key: 'might', name: 'Might' },
  { key: 'finesse', name: 'Finesse' },
  { key: 'wit', name: 'Wit' },
  { key: 'presence', name: 'Presence' },
  { key: 'craft', name: 'Craft' },
  { key: 'will', name: 'Will' },
];

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

  const [newEffect, setNewEffect] = useState<{
    type: string;
    value: number;
    target: string;
    subtype?: string;
  }>({
    type: 'hp_bonus',
    value: 0,
    target: '',
    subtype: 'flat',
  });

  // Query system spells for spell_grant dropdown
  const { data: systemSpells = [] } = useQuery({
    queryKey: ['/api/system-spells'],
    enabled: open,
  });

  // Query system items for item_grant dropdown
  const { data: systemItems = [] } = useQuery<any[]>({
    queryKey: ['/api/system-items'],
    enabled: open,
  });

  // Normalize effects for UI display - preserve ALL existing data exactly as stored
  // This function only makes a shallow copy, does NOT modify any fields
  const normalizeEffects = (effects: any[] | undefined): any[] => {
    if (!effects) return [];
    // Return a shallow copy of each effect, preserving all fields exactly
    return effects.map((effect: any) => ({ ...effect }));
  };

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
        effects: normalizeEffects(initialData.effects),
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
    // Value validation: require non-zero for most types except spell_grant, item_grant
    // Also allow hp_bonus with target (for per-level dice expressions)
    const requiresValue = newEffect.type !== 'spell_grant' && 
                          newEffect.type !== 'item_grant' &&
                          !(newEffect.type === 'hp_bonus' && newEffect.target);
    if (requiresValue && newEffect.value === 0) {
      toast({ title: 'Error', description: 'Effect value cannot be 0', variant: 'destructive' });
      return;
    }
    
    // Validate target is selected for types that need it
    if ((newEffect.type === 'skill_bonus' || newEffect.type === 'attribute_bonus') && !newEffect.target) {
      toast({ title: 'Error', description: 'Please select a target', variant: 'destructive' });
      return;
    }
    if (newEffect.type === 'spell_grant' && !newEffect.target) {
      toast({ title: 'Error', description: 'Please select a spell', variant: 'destructive' });
      return;
    }
    
    setFormData({
      ...formData,
      effects: [...(formData.effects || []), { ...newEffect }],
    });
    setNewEffect({ type: 'hp_bonus', value: 0, target: '', subtype: 'flat' });
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
              <Label>Grid X Position</Label>
              <Input
                type="number"
                value={formData.gridX}
                onChange={(e) => setFormData({ ...formData, gridX: parseInt(e.target.value) || 0 })}
                className="bg-stone-800 border-stone-700"
                data-testid="input-feat-gridx"
              />
            </div>
            <div>
              <Label>Grid Y Position</Label>
              <Input
                type="number"
                value={formData.gridY}
                onChange={(e) => setFormData({ ...formData, gridY: parseInt(e.target.value) || 0 })}
                className="bg-stone-800 border-stone-700"
                data-testid="input-feat-gridy"
              />
            </div>
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
              {(formData.effects || []).map((effect: any, idx: number) => {
                // Format display based on effect type - handles legacy undefined fields
                const getEffectDisplay = () => {
                  const value = effect.value ?? 0;
                  const target = effect.target ?? '';
                  
                  if (effect.type === 'spell_grant') {
                    const spell = (systemSpells as SystemSpell[]).find(s => s.id === target);
                    return spell ? `Grants: ${spell.name}` : target || '(select spell)';
                  }
                  if (effect.type === 'item_grant') {
                    const item = systemItems.find((i: any) => i.id === target);
                    return item ? `Grants: ${item.name}` : target || '(select item)';
                  }
                  if (effect.type === 'skill_bonus') {
                    const skill = SKILLS_LIST.find(s => s.key === target);
                    return `+${value} to ${skill?.name || target || '(select skill)'}`;
                  }
                  if (effect.type === 'attribute_bonus') {
                    const attr = ATTRIBUTES_LIST.find(a => a.key === target);
                    return `+${value} to ${attr?.name || target || '(select attribute)'}`;
                  }
                  if (effect.type === 'hp_bonus') {
                    const subtypeLabel = effect.subtype === 'per_level' ? '/level' : '';
                    // For legacy effects, show target if it contains useful info (e.g., dice expressions)
                    const hasLegacyTarget = !effect.subtype && target && target !== '';
                    if (hasLegacyTarget) {
                      // Legacy effect - show as "HP: <target>" to preserve original info
                      return `HP: ${target}`;
                    }
                    return `+${value} HP${subtypeLabel}`;
                  }
                  return `+${value}${target ? ` to ${target}` : ''}`;
                };

                return (
                  <div key={idx} className="flex items-center gap-2 bg-stone-800 p-2 rounded">
                    <Badge variant="secondary">{effect.type.replace('_', ' ')}</Badge>
                    <span className="text-sm">{getEffectDisplay()}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="ml-auto h-6 w-6 text-red-400"
                      onClick={() => removeEffect(idx)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 p-3 bg-stone-800/50 rounded border border-stone-700">
              <div className="space-y-2 mb-2">
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    value={newEffect.type}
                    onValueChange={(v) => setNewEffect({ ...newEffect, type: v, target: '', subtype: v === 'hp_bonus' ? 'flat' : undefined })}
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

                  {/* Value input - shown for all except spell/item grants */}
                  {newEffect.type !== 'spell_grant' && newEffect.type !== 'item_grant' && (
                    <Input
                      type="number"
                      value={newEffect.value}
                      onChange={(e) => setNewEffect({ ...newEffect, value: parseInt(e.target.value) || 0 })}
                      placeholder="Value"
                      className="bg-stone-800 border-stone-700 text-xs"
                    />
                  )}
                </div>

                {/* HP Bonus subtype selector */}
                {newEffect.type === 'hp_bonus' && (
                  <div className="flex gap-2">
                    <Select
                      value={newEffect.subtype || 'flat'}
                      onValueChange={(v) => setNewEffect({ ...newEffect, subtype: v })}
                    >
                      <SelectTrigger className="bg-stone-800 border-stone-700 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="flat">Flat Bonus</SelectItem>
                        <SelectItem value="per_level">Per Level</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-stone-400 self-center">
                      {newEffect.subtype === 'per_level' ? 'Adds HP each level' : 'One-time HP boost'}
                    </span>
                  </div>
                )}

                {/* Skill selector */}
                {newEffect.type === 'skill_bonus' && (
                  <Select
                    value={newEffect.target}
                    onValueChange={(v) => setNewEffect({ ...newEffect, target: v })}
                  >
                    <SelectTrigger className="bg-stone-800 border-stone-700 text-xs">
                      <SelectValue placeholder="Select skill..." />
                    </SelectTrigger>
                    <SelectContent>
                      {SKILLS_LIST.map((skill) => (
                        <SelectItem key={skill.key} value={skill.key}>{skill.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Attribute selector */}
                {newEffect.type === 'attribute_bonus' && (
                  <Select
                    value={newEffect.target}
                    onValueChange={(v) => setNewEffect({ ...newEffect, target: v })}
                  >
                    <SelectTrigger className="bg-stone-800 border-stone-700 text-xs">
                      <SelectValue placeholder="Select attribute..." />
                    </SelectTrigger>
                    <SelectContent>
                      {ATTRIBUTES_LIST.map((attr) => (
                        <SelectItem key={attr.key} value={attr.key}>{attr.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Spell selector */}
                {newEffect.type === 'spell_grant' && (
                  <Select
                    value={newEffect.target}
                    onValueChange={(v) => setNewEffect({ ...newEffect, target: v })}
                  >
                    <SelectTrigger className="bg-stone-800 border-stone-700 text-xs">
                      <SelectValue placeholder="Select spell..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(systemSpells as SystemSpell[]).length === 0 ? (
                        <div className="p-2 text-xs text-stone-400">No spells created yet</div>
                      ) : (
                        (systemSpells as SystemSpell[]).map((spell) => (
                          <SelectItem key={spell.id} value={spell.id}>
                            <span className="flex items-center gap-2">
                              <span>{spell.name}</span>
                              <Badge variant="secondary" className="text-xs">Lvl {spell.level}</Badge>
                            </span>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}

                {/* Item grant - searchable dropdown */}
                {newEffect.type === 'item_grant' && (
                  <Select
                    value={newEffect.target}
                    onValueChange={(v) => setNewEffect({ ...newEffect, target: v })}
                  >
                    <SelectTrigger className="bg-stone-800 border-stone-700 text-xs">
                      <SelectValue placeholder="Select item..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {systemItems.length === 0 ? (
                        <div className="p-2 text-xs text-stone-400">No system items available. Create items in campaign settings first.</div>
                      ) : (
                        systemItems.filter((item: any) => item.id).map((item: any) => (
                          <SelectItem key={item.id} value={item.id}>
                            <span className="flex items-center gap-2">
                              {item.image && (
                                <img src={item.image} alt="" className="w-4 h-4 rounded object-cover" />
                              )}
                              <span>{item.name}</span>
                              {item.itemType && (
                                <Badge variant="secondary" className="text-xs capitalize">{item.itemType}</Badge>
                              )}
                            </span>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
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
  featTrees?: FeatTree[];
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

function SpeciesFormDialog({ open, onOpenChange, onSave, initialData, isLoading, featTrees = [] }: SpeciesFormDialogProps) {
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

interface SpellFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<SystemSpell>) => void;
  initialData?: SystemSpell;
  isLoading?: boolean;
}

const spellSchools = ['Evocation', 'Conjuration', 'Abjuration', 'Transmutation', 'Divination', 'Enchantment', 'Illusion', 'Necromancy'];
const spellDamageTypes = ['Sharp', 'Blunt', 'Piercing', 'Flame', 'Frost', 'Storm', 'Tide', 'Stone', 'Flux', 'Light', 'Dark', 'Sound', 'Health'];
const targetTypes = ['self', 'single', 'multiple', 'area', 'cone', 'line'];
const savingThrows = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'];
const spellAoeTypes = ['cone', 'sphere', 'line', 'cube', 'cylinder'];
const spellAttributes = ['might', 'finesse', 'wit', 'presence', 'will', 'craft'];

function SpellFormDialog({ open, onOpenChange, onSave, initialData, isLoading }: SpellFormDialogProps) {
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    icon: string;
    school: string;
    level: number | string;
    castingTime: string;
    range: string;
    rangeNum: number | string;
    duration: string;
    components: string;
    damageType: string;
    damageDice: string;
    mod: number | string;
    attribute: string;
    healingDice: string;
    energyCost: number | string;
    concentration: boolean;
    ritual: boolean;
    targetType: string;
    areaSize: string;
    aoe: string;
    savingThrow: string;
  }>({
    name: initialData?.name || '',
    description: initialData?.description || '',
    icon: initialData?.icon || '',
    school: initialData?.school || 'Evocation',
    level: initialData?.level ?? 1,
    castingTime: initialData?.castingTime || '1 action',
    range: initialData?.range || '30 ft',
    rangeNum: initialData?.rangeNum ?? 30,
    duration: initialData?.duration || 'Instantaneous',
    components: initialData?.components || 'V, S',
    damageType: initialData?.damageType || '',
    damageDice: initialData?.damageDice || '',
    mod: initialData?.mod ?? 0,
    attribute: initialData?.attribute || '',
    healingDice: initialData?.healingDice || '',
    energyCost: initialData?.energyCost ?? 1,
    concentration: initialData?.concentration || false,
    ritual: initialData?.ritual || false,
    targetType: initialData?.targetType || 'single',
    areaSize: initialData?.areaSize || '',
    aoe: initialData?.aoe || '',
    savingThrow: initialData?.savingThrow || '',
  });

  const handleNumericChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value === '' ? '' : parseInt(value) });
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ title: 'Error', description: 'Spell name is required', variant: 'destructive' });
      return;
    }
    // Convert _none sentinel values back to empty strings for storage
    const normalizeNone = (val: string) => val === '_none' ? '' : val;
    onSave({
      ...formData,
      attribute: normalizeNone(formData.attribute),
      damageType: normalizeNone(formData.damageType),
      aoe: normalizeNone(formData.aoe),
      savingThrow: normalizeNone(formData.savingThrow),
      level: Number(formData.level) || 1,
      rangeNum: Number(formData.rangeNum) || 30,
      mod: Number(formData.mod) || 0,
      energyCost: Number(formData.energyCost) || 1,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-blue-500">
            {initialData ? 'Edit Spell' : 'Create Spell'}
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
                  data-testid="input-spell-name"
                />
              </div>

              <div className="col-span-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="bg-stone-800 border-stone-700 min-h-[80px]"
                  data-testid="textarea-spell-description"
                />
              </div>

              <div>
                <Label>School</Label>
                <Select value={formData.school} onValueChange={(v) => setFormData({ ...formData, school: v })}>
                  <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-spell-school">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {spellSchools.map((school) => (
                      <SelectItem key={school} value={school}>{school}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Level (0-9)</Label>
                <Input
                  type="number"
                  min="0"
                  max="9"
                  value={formData.level}
                  onChange={(e) => handleNumericChange('level', e.target.value)}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-spell-level"
                />
              </div>

              <div>
                <Label>Casting Time</Label>
                <Input
                  value={formData.castingTime}
                  onChange={(e) => setFormData({ ...formData, castingTime: e.target.value })}
                  placeholder="1 action"
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-spell-casting-time"
                />
              </div>

              <div>
                <Label>Range (description)</Label>
                <Input
                  value={formData.range}
                  onChange={(e) => setFormData({ ...formData, range: e.target.value })}
                  placeholder="30 ft"
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-spell-range"
                />
              </div>

              <div>
                <Label>Range (feet)</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.rangeNum}
                  onChange={(e) => handleNumericChange('rangeNum', e.target.value)}
                  placeholder="30"
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-spell-range-num"
                />
              </div>

              <div>
                <Label>Duration</Label>
                <Input
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                  placeholder="Instantaneous"
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-spell-duration"
                />
              </div>

              <div>
                <Label>Components</Label>
                <Input
                  value={formData.components}
                  onChange={(e) => setFormData({ ...formData, components: e.target.value })}
                  placeholder="V, S, M"
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-spell-components"
                />
              </div>

              <div>
                <Label>Attribute (for rolls)</Label>
                <Select value={formData.attribute || '_none'} onValueChange={(v) => setFormData({ ...formData, attribute: v === '_none' ? '' : v })}>
                  <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-spell-attribute">
                    <SelectValue placeholder="Select attribute" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {spellAttributes.map((attr) => (
                      <SelectItem key={attr} value={attr}>{attr.charAt(0).toUpperCase() + attr.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Damage Dice</Label>
                <Input
                  value={formData.damageDice}
                  onChange={(e) => setFormData({ ...formData, damageDice: e.target.value })}
                  placeholder="3d6"
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-spell-damage-dice"
                />
              </div>

              <div>
                <Label>Damage Type</Label>
                <Select value={formData.damageType || '_none'} onValueChange={(v) => setFormData({ ...formData, damageType: v === '_none' ? '' : v })}>
                  <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-spell-damage-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {spellDamageTypes.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Damage Mod (+/-)</Label>
                <Input
                  type="number"
                  value={formData.mod}
                  onChange={(e) => handleNumericChange('mod', e.target.value)}
                  placeholder="0"
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-spell-mod"
                />
              </div>

              <div>
                <Label>Area of Effect</Label>
                <Select value={formData.aoe || '_none'} onValueChange={(v) => setFormData({ ...formData, aoe: v === '_none' ? '' : v })}>
                  <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-spell-aoe">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {spellAoeTypes.map((aoe) => (
                      <SelectItem key={aoe} value={aoe}>{aoe.charAt(0).toUpperCase() + aoe.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Healing Dice</Label>
                <Input
                  value={formData.healingDice}
                  onChange={(e) => setFormData({ ...formData, healingDice: e.target.value })}
                  placeholder="2d8+4"
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-spell-healing-dice"
                />
              </div>

              <div>
                <Label>Energy Cost</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.energyCost}
                  onChange={(e) => handleNumericChange('energyCost', e.target.value)}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-spell-energy-cost"
                />
              </div>

              <div>
                <Label>Target Type</Label>
                <Select value={formData.targetType} onValueChange={(v) => setFormData({ ...formData, targetType: v })}>
                  <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-spell-target-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {targetTypes.map((type) => (
                      <SelectItem key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Area Size (if applicable)</Label>
                <Input
                  value={formData.areaSize}
                  onChange={(e) => setFormData({ ...formData, areaSize: e.target.value })}
                  placeholder="20 ft radius"
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-spell-area-size"
                />
              </div>

              <div>
                <Label>Saving Throw</Label>
                <Select value={formData.savingThrow || '_none'} onValueChange={(v) => setFormData({ ...formData, savingThrow: v === '_none' ? '' : v })}>
                  <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-spell-saving-throw">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {savingThrows.map((save) => (
                      <SelectItem key={save} value={save}>{save}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2 flex gap-6">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="concentration"
                    checked={formData.concentration}
                    onCheckedChange={(checked) => setFormData({ ...formData, concentration: !!checked })}
                    data-testid="checkbox-spell-concentration"
                  />
                  <Label htmlFor="concentration" className="cursor-pointer">Concentration</Label>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="ritual"
                    checked={formData.ritual}
                    onCheckedChange={(checked) => setFormData({ ...formData, ritual: !!checked })}
                    data-testid="checkbox-spell-ritual"
                  />
                  <Label htmlFor="ritual" className="cursor-pointer">Ritual</Label>
                </div>
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
            className="bg-blue-700 hover:bg-blue-600"
            data-testid="button-save-spell"
          >
            {isLoading ? 'Saving...' : initialData ? 'Update Spell' : 'Create Spell'}
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
    // Convert _none sentinel values back to empty strings for storage
    const normalizeNone = (val: string) => val === '_none' ? '' : val;
    const cleanedData = {
      ...formData,
      ammunitionType: normalizeNone(formData.ammunitionType),
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
                    <Select value={formData.ammunitionType || '_none'} onValueChange={(v) => setFormData({ ...formData, ammunitionType: v === '_none' ? '' : v })}>
                      <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-weapon-ammo">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">None</SelectItem>
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
