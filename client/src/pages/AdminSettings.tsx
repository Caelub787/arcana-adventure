import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, useMotionValue } from 'framer-motion';
import { api, type Item, type SystemSpecies, type FeatTree, type Feat, type FeatConnection, type FeatTreeWithData, type FeatTemplate, type SystemSpell, type SystemSkill, type SystemTrait, type Character, type TokenEffect, type SpellEffect, type ItemEffect } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { toast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, Pencil, Trash2, Sword, Shield, Package, Sparkles, Box, Coins, Search, Users, User, GitBranch, Library, Link, X, GripVertical, Star, Zap, Heart, ShieldCheck, BookOpen, RefreshCw, ZoomIn, ZoomOut, Wand2, Save, Flame } from 'lucide-react';
import { ImageBrowser } from '@/components/ImageBrowser';
import { CharacterSheet } from '@/components/game/GameComponents';

type AdminView = 'dashboard' | 'items' | 'species' | 'spells' | 'skills' | 'traits' | 'feat-trees' | 'characters' | 'token-effects';

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

  const [showAddSkill, setShowAddSkill] = useState(false);
  const [editingSkill, setEditingSkill] = useState<SystemSkill | null>(null);
  const [skillSearchQuery, setSkillSearchQuery] = useState('');

  const [showAddTrait, setShowAddTrait] = useState(false);
  const [editingTrait, setEditingTrait] = useState<SystemTrait | null>(null);
  const [traitSearchQuery, setTraitSearchQuery] = useState('');

  const [showAddCharacter, setShowAddCharacter] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [characterSearchQuery, setCharacterSearchQuery] = useState('');
  const [viewingCharacterSheet, setViewingCharacterSheet] = useState<Character | null>(null);

  const [showAddTokenEffect, setShowAddTokenEffect] = useState(false);
  const [editingTokenEffect, setEditingTokenEffect] = useState<TokenEffect | null>(null);
  const [tokenEffectSearchQuery, setTokenEffectSearchQuery] = useState('');

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

  const { data: systemSkills = [], isLoading: skillsLoading } = useQuery({
    queryKey: ['system-skills'],
    queryFn: () => api.getSystemSkills(),
    enabled: isAdmin && currentView === 'skills',
  });

  const { data: systemTraits = [], isLoading: traitsLoading } = useQuery({
    queryKey: ['system-traits'],
    queryFn: () => api.getSystemTraits(),
    enabled: isAdmin && currentView === 'traits',
  });

  const { data: characterTemplates = [], isLoading: charactersLoading } = useQuery({
    queryKey: ['character-templates'],
    queryFn: () => api.getCharacterTemplates(),
    enabled: isAdmin && currentView === 'characters',
  });

  const { data: tokenEffects = [], isLoading: tokenEffectsLoading } = useQuery({
    queryKey: ['token-effects'],
    queryFn: () => api.getTokenEffects(),
    enabled: isAdmin && currentView === 'token-effects',
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

  const createSkillMutation = useMutation({
    mutationFn: (skill: Partial<SystemSkill>) => api.createSystemSkill(skill),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-skills'] });
      setShowAddSkill(false);
      toast({ title: 'Skill Created', description: 'Custom skill created successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateSkillMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<SystemSkill> }) => api.updateSystemSkill(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-skills'] });
      setEditingSkill(null);
      toast({ title: 'Skill Updated', description: 'Custom skill updated successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteSkillMutation = useMutation({
    mutationFn: (id: string) => api.deleteSystemSkill(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-skills'] });
      toast({ title: 'Skill Deleted', description: 'Custom skill deleted successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const createTraitMutation = useMutation({
    mutationFn: (trait: Partial<SystemTrait>) => api.createSystemTrait(trait),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-traits'] });
      setShowAddTrait(false);
      toast({ title: 'Trait Created', description: 'System trait created successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateTraitMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<SystemTrait> }) => api.updateSystemTrait(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-traits'] });
      setEditingTrait(null);
      toast({ title: 'Trait Updated', description: 'System trait updated successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteTraitMutation = useMutation({
    mutationFn: (id: string) => api.deleteSystemTrait(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-traits'] });
      toast({ title: 'Trait Deleted', description: 'System trait deleted successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const createCharacterMutation = useMutation({
    mutationFn: (character: Partial<Character>) => api.createCharacterTemplate(character),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['character-templates'] });
      setShowAddCharacter(false);
      toast({ title: 'Character Created', description: 'Character template created successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateCharacterMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Character> }) => api.updateCharacterTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['character-templates'] });
      setEditingCharacter(null);
      toast({ title: 'Character Updated', description: 'Character template updated successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteCharacterMutation = useMutation({
    mutationFn: (id: string) => api.deleteCharacterTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['character-templates'] });
      toast({ title: 'Character Deleted', description: 'Character template deleted successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const createTokenEffectMutation = useMutation({
    mutationFn: (effect: Partial<TokenEffect>) => api.createTokenEffect(effect),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['token-effects'] });
      setShowAddTokenEffect(false);
      toast({ title: 'Effect Created', description: 'Token effect created successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateTokenEffectMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TokenEffect> }) => api.updateTokenEffect(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['token-effects'] });
      setEditingTokenEffect(null);
      toast({ title: 'Effect Updated', description: 'Token effect updated successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteTokenEffectMutation = useMutation({
    mutationFn: (id: string) => api.deleteTokenEffect(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['token-effects'] });
      toast({ title: 'Effect Deleted', description: 'Token effect deleted successfully' });
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
  const debouncedSkillSearchQuery = useDebouncedValue(skillSearchQuery, 150);
  const debouncedTraitSearchQuery = useDebouncedValue(traitSearchQuery, 150);
  const debouncedCharacterSearchQuery = useDebouncedValue(characterSearchQuery, 150);
  const debouncedTokenEffectSearchQuery = useDebouncedValue(tokenEffectSearchQuery, 150);
  
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
             (spell.description?.toLowerCase().includes(debouncedSpellSearchQuery.toLowerCase()));
    });
  }, [systemSpells, debouncedSpellSearchQuery]);

  const filteredSkills = useMemo(() => {
    return systemSkills.filter((skill: SystemSkill) => {
      return skill.name.toLowerCase().includes(debouncedSkillSearchQuery.toLowerCase()) ||
             (skill.description?.toLowerCase().includes(debouncedSkillSearchQuery.toLowerCase()));
    });
  }, [systemSkills, debouncedSkillSearchQuery]);

  const filteredTraits = useMemo(() => {
    return systemTraits.filter((trait: SystemTrait) => {
      return trait.name.toLowerCase().includes(debouncedTraitSearchQuery.toLowerCase()) ||
             (trait.description?.toLowerCase().includes(debouncedTraitSearchQuery.toLowerCase()));
    });
  }, [systemTraits, debouncedTraitSearchQuery]);

  const filteredCharacters = useMemo(() => {
    return characterTemplates.filter((character: Character) => {
      return character.name.toLowerCase().includes(debouncedCharacterSearchQuery.toLowerCase()) ||
             (character.race?.toLowerCase().includes(debouncedCharacterSearchQuery.toLowerCase()));
    });
  }, [characterTemplates, debouncedCharacterSearchQuery]);

  const filteredTokenEffects = useMemo(() => {
    return tokenEffects.filter((effect: TokenEffect) => {
      return effect.name.toLowerCase().includes(debouncedTokenEffectSearchQuery.toLowerCase()) ||
             (effect.description?.toLowerCase().includes(debouncedTokenEffectSearchQuery.toLowerCase()));
    });
  }, [tokenEffects, debouncedTokenEffectSearchQuery]);

  const handleBackNavigation = () => {
    if (currentView === 'dashboard') {
      setLocation('/');
    } else {
      setCurrentView('dashboard');
    }
  };

  return (
    <div className="h-screen bg-stone-950 text-stone-200 flex flex-col overflow-auto">
      <div className="w-full px-4 py-4 flex flex-col flex-1 min-h-0">
        <div className="flex items-center gap-4 mb-4 shrink-0">
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
               currentView === 'spells' ? 'Spells' : 
               currentView === 'skills' ? 'Custom Skills' : 
               currentView === 'traits' ? 'Traits' : 
               currentView === 'characters' ? 'Character Templates' : 
               currentView === 'token-effects' ? 'Token Effects' : 'Feat Trees'}
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

        {currentView === 'skills' && (
          <SkillsView
            skills={filteredSkills}
            isLoading={skillsLoading}
            searchQuery={skillSearchQuery}
            setSearchQuery={setSkillSearchQuery}
            onAddSkill={() => setShowAddSkill(true)}
            onEditSkill={setEditingSkill}
            onDeleteSkill={(id) => {
              if (confirm('Are you sure you want to delete this skill?')) {
                deleteSkillMutation.mutate(id);
              }
            }}
          />
        )}

        {currentView === 'traits' && (
          <TraitsView
            traits={filteredTraits}
            isLoading={traitsLoading}
            searchQuery={traitSearchQuery}
            setSearchQuery={setTraitSearchQuery}
            onAddTrait={() => setShowAddTrait(true)}
            onEditTrait={setEditingTrait}
            onDeleteTrait={(id) => {
              if (confirm('Are you sure you want to delete this trait?')) {
                deleteTraitMutation.mutate(id);
              }
            }}
          />
        )}

        {currentView === 'characters' && (
          <CharactersView
            characters={filteredCharacters}
            isLoading={charactersLoading}
            searchQuery={characterSearchQuery}
            setSearchQuery={setCharacterSearchQuery}
            onAddCharacter={() => setShowAddCharacter(true)}
            onEditCharacter={setEditingCharacter}
            onDeleteCharacter={(id) => {
              if (confirm('Are you sure you want to delete this character template?')) {
                deleteCharacterMutation.mutate(id);
              }
            }}
            onViewSheet={setViewingCharacterSheet}
          />
        )}

        {currentView === 'token-effects' && (
          <TokenEffectsView
            effects={filteredTokenEffects}
            isLoading={tokenEffectsLoading}
            searchQuery={tokenEffectSearchQuery}
            setSearchQuery={setTokenEffectSearchQuery}
            onAddEffect={() => setShowAddTokenEffect(true)}
            onEditEffect={setEditingTokenEffect}
            onDeleteEffect={(id) => {
              if (confirm('Are you sure you want to delete this effect?')) {
                deleteTokenEffectMutation.mutate(id);
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

        <SkillFormDialog
          open={showAddSkill}
          onOpenChange={setShowAddSkill}
          onSave={(data) => createSkillMutation.mutate(data)}
          isLoading={createSkillMutation.isPending}
        />

        {editingSkill && (
          <SkillFormDialog
            open={!!editingSkill}
            onOpenChange={() => setEditingSkill(null)}
            onSave={(data) => updateSkillMutation.mutate({ id: editingSkill.id, data })}
            initialData={editingSkill}
            isLoading={updateSkillMutation.isPending}
          />
        )}

        <TraitFormDialog
          open={showAddTrait}
          onOpenChange={setShowAddTrait}
          onSave={(data) => createTraitMutation.mutate(data)}
          isLoading={createTraitMutation.isPending}
        />

        {editingTrait && (
          <TraitFormDialog
            open={!!editingTrait}
            onOpenChange={() => setEditingTrait(null)}
            onSave={(data) => updateTraitMutation.mutate({ id: editingTrait.id, data })}
            initialData={editingTrait}
            isLoading={updateTraitMutation.isPending}
          />
        )}

        <CharacterFormDialog
          open={showAddCharacter}
          onOpenChange={setShowAddCharacter}
          onSave={(data) => createCharacterMutation.mutate(data)}
          isLoading={createCharacterMutation.isPending}
        />

        {editingCharacter && (
          <CharacterFormDialog
            open={!!editingCharacter}
            onOpenChange={() => setEditingCharacter(null)}
            onSave={(data) => updateCharacterMutation.mutate({ id: editingCharacter.id, data })}
            initialData={editingCharacter}
            isLoading={updateCharacterMutation.isPending}
          />
        )}

        <TokenEffectFormDialog
          open={showAddTokenEffect}
          onOpenChange={setShowAddTokenEffect}
          onSave={(data) => createTokenEffectMutation.mutate(data)}
          isLoading={createTokenEffectMutation.isPending}
        />

        {editingTokenEffect && (
          <TokenEffectFormDialog
            open={!!editingTokenEffect}
            onOpenChange={() => setEditingTokenEffect(null)}
            onSave={(data) => updateTokenEffectMutation.mutate({ id: editingTokenEffect.id, data })}
            initialData={editingTokenEffect}
            isLoading={updateTokenEffectMutation.isPending}
          />
        )}

        {viewingCharacterSheet && (
          <div className="fixed inset-0 z-50 bg-stone-950/95 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto">
              <CharacterSheet
                character={viewingCharacterSheet}
                isGM={true}
                isOwner={true}
                isTemplate={true}
                onUpdate={(updates) => {
                  updateCharacterMutation.mutate(
                    { id: viewingCharacterSheet.id, data: updates },
                    {
                      onSuccess: (updatedChar) => {
                        setViewingCharacterSheet(updatedChar);
                      }
                    }
                  );
                }}
                onClose={() => {
                  setViewingCharacterSheet(null);
                  queryClient.invalidateQueries({ queryKey: ['admin-character-templates'] });
                }}
              />
            </div>
          </div>
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
        onClick={() => onNavigate('skills')}
        data-testid="card-system-skills"
      >
        <CardHeader>
          <div className="h-12 w-12 rounded-lg bg-cyan-700/20 flex items-center justify-center mb-2">
            <BookOpen className="h-6 w-6 text-cyan-500" />
          </div>
          <CardTitle className="text-cyan-500">Custom Skills</CardTitle>
          <CardDescription className="text-stone-400">
            Create custom skills that can be added to character sheets
          </CardDescription>
        </CardHeader>
      </Card>

      <Card 
        className="bg-stone-900 border-stone-700 cursor-pointer hover:border-amber-600 transition-colors"
        onClick={() => onNavigate('traits')}
        data-testid="card-system-traits"
      >
        <CardHeader>
          <div className="h-12 w-12 rounded-lg bg-rose-700/20 flex items-center justify-center mb-2">
            <Star className="h-6 w-6 text-rose-500" />
          </div>
          <CardTitle className="text-rose-500">Traits</CardTitle>
          <CardDescription className="text-stone-400">
            Create traits with limited uses that reset on long rest
          </CardDescription>
        </CardHeader>
      </Card>

      <Card 
        className="bg-stone-900 border-stone-700 cursor-pointer hover:border-amber-600 transition-colors"
        onClick={() => onNavigate('token-effects')}
        data-testid="card-token-effects"
      >
        <CardHeader>
          <div className="h-12 w-12 rounded-lg bg-violet-700/20 flex items-center justify-center mb-2">
            <Flame className="h-6 w-6 text-violet-500" />
          </div>
          <CardTitle className="text-violet-500">Token Effects</CardTitle>
          <CardDescription className="text-stone-400">
            Define status effects like poison, burning, or stun that can be applied to tokens in combat
          </CardDescription>
        </CardHeader>
      </Card>

      <Card 
        className="bg-stone-900 border-stone-700 cursor-pointer hover:border-amber-600 transition-colors"
        onClick={() => onNavigate('characters')}
        data-testid="card-character-templates"
      >
        <CardHeader>
          <div className="h-12 w-12 rounded-lg bg-teal-700/20 flex items-center justify-center mb-2">
            <User className="h-6 w-6 text-teal-500" />
          </div>
          <CardTitle className="text-teal-500">Character Templates</CardTitle>
          <CardDescription className="text-stone-400">
            Create reusable character templates for quick character creation
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
    <Card className="bg-stone-900 border-stone-700 flex-1 flex flex-col min-h-0">
      <CardHeader className="flex flex-row items-center justify-between shrink-0">
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
      <CardContent className="flex-1 flex flex-col min-h-0">
        <div className="flex gap-4 mb-4 shrink-0">
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
          <ScrollArea className="flex-1 min-h-0">
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
    <Card className="bg-stone-900 border-stone-700 flex-1 flex flex-col min-h-0">
      <CardHeader className="flex flex-row items-center justify-between shrink-0">
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
      <CardContent className="flex-1 flex flex-col min-h-0">
        <div className="mb-4 shrink-0">
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
          <ScrollArea className="flex-1 min-h-0">
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


function SpellsView({ spells, isLoading, searchQuery, setSearchQuery, onAddSpell, onEditSpell, onDeleteSpell }: SpellsViewProps) {
  return (
    <Card className="bg-stone-900 border-stone-700 flex-1 flex flex-col min-h-0">
      <CardHeader className="flex flex-row items-center justify-between shrink-0">
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
      <CardContent className="flex-1 flex flex-col min-h-0">
        <div className="mb-4 shrink-0">
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
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-2">
              {spells.map((spell: SystemSpell) => (
                <div
                  key={spell.id}
                  className="flex items-center gap-4 p-3 rounded-lg bg-stone-800 border border-stone-700 hover:border-stone-600"
                  data-testid={`spell-row-${spell.id}`}
                >
                  <div className="h-12 w-12 rounded bg-stone-700 flex items-center justify-center overflow-hidden">
                    {spell.icon ? (
                      <img src={spell.icon} alt={spell.name} className="h-full w-full object-cover" />
                    ) : (
                      <Sparkles className="h-6 w-6 text-blue-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{spell.name}</span>
                      <Badge className={spell.castingTime?.toLowerCase().includes('bonus') ? 'bg-blue-600 text-xs' : 'bg-red-600 text-xs'}>
                        {spell.castingTime?.toLowerCase().includes('bonus') ? 'Bonus Action' : 'Action'}
                      </Badge>
                    </div>
                    <div className="text-sm text-stone-400 flex flex-wrap gap-2">
                      <span>Range: {spell.range}</span>
                      <span>| {spell.duration}</span>
                      {spell.damageDice && <span>| Damage: {spell.damageDice} {spell.damageType}</span>}
                      {spell.energyCost && <span className="text-cyan-400">| Energy: {spell.energyCost}</span>}
                      {spell.isAoe && <span>| AoE{spell.aoeShape ? `: ${spell.aoeShape.charAt(0).toUpperCase() + spell.aoeShape.slice(1)}` : ''}{spell.aoeRange ? ` ${spell.aoeRange}ft` : ''}</span>}
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

interface SkillsViewProps {
  skills: SystemSkill[];
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onAddSkill: () => void;
  onEditSkill: (skill: SystemSkill) => void;
  onDeleteSkill: (id: string) => void;
}

const parentAttributeColors: Record<string, string> = {
  might: 'text-red-400',
  finesse: 'text-green-400',
  wit: 'text-blue-400',
  presence: 'text-purple-400',
  will: 'text-yellow-400',
  craft: 'text-orange-400',
};

function SkillsView({ skills, isLoading, searchQuery, setSearchQuery, onAddSkill, onEditSkill, onDeleteSkill }: SkillsViewProps) {
  return (
    <Card className="bg-stone-900 border-stone-700 flex-1 flex flex-col min-h-0">
      <CardHeader className="flex flex-row items-center justify-between shrink-0">
        <CardTitle className="text-cyan-500">Custom Skills</CardTitle>
        <Button
          onClick={onAddSkill}
          className="bg-cyan-700 hover:bg-cyan-600"
          data-testid="button-add-skill"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Skill
        </Button>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0">
        <div className="mb-4 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
            <Input
              placeholder="Search skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-stone-800 border-stone-700"
              data-testid="input-search-skills"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-stone-400">Loading skills...</div>
        ) : skills.length === 0 ? (
          <div className="text-center py-12 text-stone-400">
            <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-bold">No custom skills found</p>
            <p className="text-sm mt-2">Create custom skills that can be added to character sheets</p>
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-2">
              {skills.map((skill: SystemSkill) => (
                <div
                  key={skill.id}
                  className="flex items-center gap-4 p-3 rounded-lg bg-stone-800 border border-stone-700 hover:border-stone-600"
                  data-testid={`skill-row-${skill.id}`}
                >
                  <div className="h-12 w-12 rounded bg-stone-700 flex items-center justify-center overflow-hidden">
                    <BookOpen className="h-6 w-6 text-cyan-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{skill.name}</span>
                      <Badge className={`bg-stone-700 ${parentAttributeColors[skill.parentAttribute] || 'text-stone-300'} text-xs`}>
                        {skill.parentAttribute.charAt(0).toUpperCase() + skill.parentAttribute.slice(1)}
                      </Badge>
                    </div>
                    {skill.description && (
                      <div className="text-sm text-stone-400 truncate">
                        {skill.description}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEditSkill(skill)}
                      className="text-stone-400 hover:text-cyan-500"
                      data-testid={`button-edit-skill-${skill.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDeleteSkill(skill.id)}
                      className="text-stone-400 hover:text-red-500"
                      data-testid={`button-delete-skill-${skill.id}`}
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

interface SkillFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<SystemSkill>) => void;
  initialData?: SystemSkill;
  isLoading?: boolean;
}

const parentAttributeOptions = ['might', 'finesse', 'wit', 'presence', 'will', 'craft'];

function SkillFormDialog({ open, onOpenChange, onSave, initialData, isLoading }: SkillFormDialogProps) {
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    parentAttribute: string;
  }>({
    name: initialData?.name || '',
    description: initialData?.description || '',
    parentAttribute: initialData?.parentAttribute || 'wit',
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        description: initialData.description || '',
        parentAttribute: initialData.parentAttribute || 'wit',
      });
    } else {
      setFormData({
        name: '',
        description: '',
        parentAttribute: 'wit',
      });
    }
  }, [initialData, open]);

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast({ title: 'Error', description: 'Skill name is required', variant: 'destructive' });
      return;
    }
    onSave({
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      parentAttribute: formData.parentAttribute,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-cyan-500">
            {initialData ? 'Edit Skill' : 'Create Skill'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-stone-300">Skill Name</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Alchemy"
              className="bg-stone-800 border-stone-700 mt-1"
              data-testid="input-skill-name"
            />
          </div>

          <div>
            <Label className="text-stone-300">Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe what this skill represents..."
              className="bg-stone-800 border-stone-700 mt-1"
              rows={3}
              data-testid="input-skill-description"
            />
          </div>

          <div>
            <Label className="text-stone-300">Parent Attribute</Label>
            <Select
              value={formData.parentAttribute}
              onValueChange={(value) => setFormData({ ...formData, parentAttribute: value })}
            >
              <SelectTrigger className="bg-stone-800 border-stone-700 mt-1" data-testid="select-skill-attribute">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {parentAttributeOptions.map((attr) => (
                  <SelectItem key={attr} value={attr}>
                    {attr.charAt(0).toUpperCase() + attr.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-stone-500 mt-1">
              The parent attribute determines which stat modifier is added to skill rolls
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-stone-700"
            data-testid="button-cancel-skill"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading}
            className="bg-cyan-700 hover:bg-cyan-600"
            data-testid="button-save-skill"
          >
            {isLoading ? 'Saving...' : (initialData ? 'Update' : 'Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TraitsViewProps {
  traits: SystemTrait[];
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onAddTrait: () => void;
  onEditTrait: (trait: SystemTrait) => void;
  onDeleteTrait: (id: string) => void;
}

function TraitsView({ traits, isLoading, searchQuery, setSearchQuery, onAddTrait, onEditTrait, onDeleteTrait }: TraitsViewProps) {
  return (
    <Card className="bg-stone-900 border-stone-700 flex-1 flex flex-col min-h-0">
      <CardHeader className="flex flex-row items-center justify-between shrink-0">
        <CardTitle className="text-rose-500">Traits</CardTitle>
        <Button
          onClick={onAddTrait}
          className="bg-rose-700 hover:bg-rose-600"
          data-testid="button-add-trait"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Trait
        </Button>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0">
        <div className="mb-4 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
            <Input
              placeholder="Search traits..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-stone-800 border-stone-700"
              data-testid="input-search-traits"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-stone-400">Loading traits...</div>
        ) : traits.length === 0 ? (
          <div className="text-center py-12 text-stone-400">
            <Star className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-bold">No traits found</p>
            <p className="text-sm mt-2">Create traits with limited uses that reset on long rest</p>
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-2">
              {traits.map((trait: SystemTrait) => (
                <div
                  key={trait.id}
                  className="p-3 rounded-lg bg-stone-800 border border-stone-700 hover:border-stone-600"
                  data-testid={`trait-row-${trait.id}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Star className="h-5 w-5 text-rose-400 shrink-0" />
                      <span className="font-medium truncate">{trait.name}</span>
                      <Badge className={`bg-stone-700 ${parentAttributeColors[trait.parentAttribute] || 'text-stone-300'} text-xs shrink-0`}>
                        {trait.parentAttribute.charAt(0).toUpperCase() + trait.parentAttribute.slice(1)}
                      </Badge>
                      <Badge className="bg-rose-700 text-xs shrink-0">
                        {trait.usesPerLongRest}/rest
                      </Badge>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEditTrait(trait)}
                        className="h-8 w-8 text-stone-400 hover:text-rose-500"
                        data-testid={`button-edit-trait-${trait.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDeleteTrait(trait.id)}
                        className="h-8 w-8 text-stone-400 hover:text-red-500"
                        data-testid={`button-delete-trait-${trait.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {trait.description && (
                    <div className="text-sm text-stone-400 mt-1 line-clamp-2">
                      {trait.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

interface TraitFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<SystemTrait>) => void;
  initialData?: SystemTrait;
  isLoading?: boolean;
}

const DAMAGE_TYPES = ['Sharp', 'Blunt', 'Piercing', 'Flame', 'Frost', 'Storm', 'Tide', 'Stone', 'Flux', 'Light', 'Dark', 'Sound'];

function TraitFormDialog({ open, onOpenChange, onSave, initialData, isLoading }: TraitFormDialogProps) {
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    parentAttribute: string;
    usesPerLongRest: number;
    usesPerShortRest: number;
    damageModifierType: string;
    damageModifierDamageType: string;
    damageModifierValue: number;
  }>({
    name: initialData?.name || '',
    description: initialData?.description || '',
    parentAttribute: initialData?.parentAttribute || 'wit',
    usesPerLongRest: initialData?.usesPerLongRest || 1,
    usesPerShortRest: initialData?.usesPerShortRest || 0,
    damageModifierType: initialData?.damageModifierType || 'none',
    damageModifierDamageType: initialData?.damageModifierDamageType || '',
    damageModifierValue: initialData?.damageModifierValue || 0,
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        description: initialData.description || '',
        parentAttribute: initialData.parentAttribute || 'wit',
        usesPerLongRest: initialData.usesPerLongRest || 1,
        usesPerShortRest: initialData.usesPerShortRest || 0,
        damageModifierType: initialData.damageModifierType || 'none',
        damageModifierDamageType: initialData.damageModifierDamageType || '',
        damageModifierValue: initialData.damageModifierValue || 0,
      });
    } else {
      setFormData({
        name: '',
        description: '',
        parentAttribute: 'wit',
        usesPerLongRest: 1,
        usesPerShortRest: 0,
        damageModifierType: 'none',
        damageModifierDamageType: '',
        damageModifierValue: 0,
      });
    }
  }, [initialData, open]);

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast({ title: 'Error', description: 'Trait name is required', variant: 'destructive' });
      return;
    }
    if (formData.damageModifierType !== 'none' && !formData.damageModifierDamageType) {
      toast({ title: 'Error', description: 'Please select a damage type for the damage modifier', variant: 'destructive' });
      return;
    }
    onSave({
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      parentAttribute: formData.parentAttribute,
      usesPerLongRest: formData.usesPerLongRest,
      usesPerShortRest: formData.usesPerShortRest,
      damageModifierType: formData.damageModifierType,
      damageModifierDamageType: formData.damageModifierType !== 'none' ? formData.damageModifierDamageType : undefined,
      damageModifierValue: formData.damageModifierType === 'reduce' ? formData.damageModifierValue : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-rose-500">
            {initialData ? 'Edit Trait' : 'Create Trait'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-stone-300">Trait Name</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Second Wind"
              className="bg-stone-800 border-stone-700 mt-1"
              data-testid="input-trait-name"
            />
          </div>

          <div>
            <Label className="text-stone-300">Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe what this trait does..."
              className="bg-stone-800 border-stone-700 mt-1"
              rows={3}
              data-testid="input-trait-description"
            />
          </div>

          <div>
            <Label className="text-stone-300">Parent Attribute</Label>
            <Select
              value={formData.parentAttribute}
              onValueChange={(value) => setFormData({ ...formData, parentAttribute: value })}
            >
              <SelectTrigger className="bg-stone-800 border-stone-700 mt-1" data-testid="select-trait-attribute">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {parentAttributeOptions.map((attr) => (
                  <SelectItem key={attr} value={attr}>
                    {attr.charAt(0).toUpperCase() + attr.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-stone-500 mt-1">
              The parent attribute determines which stat modifier is added to trait rolls
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-stone-300">Uses Per Long Rest</Label>
              <Input
                type="number"
                min={0}
                value={formData.usesPerLongRest}
                onChange={(e) => setFormData({ ...formData, usesPerLongRest: Math.max(0, parseInt(e.target.value) || 0) })}
                className="bg-stone-800 border-stone-700 mt-1"
                data-testid="input-trait-uses-long"
              />
              <p className="text-xs text-stone-500 mt-1">
                Uses restored on long rest
              </p>
            </div>
            <div>
              <Label className="text-stone-300">Uses Per Short Rest</Label>
              <Input
                type="number"
                min={0}
                value={formData.usesPerShortRest}
                onChange={(e) => setFormData({ ...formData, usesPerShortRest: Math.max(0, parseInt(e.target.value) || 0) })}
                className="bg-stone-800 border-stone-700 mt-1"
                data-testid="input-trait-uses-short"
              />
              <p className="text-xs text-stone-500 mt-1">
                Uses restored on short rest
              </p>
            </div>
          </div>

          <div>
            <Label className="text-stone-300">Damage Modifier</Label>
            <Select
              value={formData.damageModifierType}
              onValueChange={(value) => setFormData({ ...formData, damageModifierType: value })}
            >
              <SelectTrigger className="bg-stone-800 border-stone-700 mt-1" data-testid="select-damage-modifier-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="reduce">Reduce (flat reduction)</SelectItem>
                <SelectItem value="resistance">Resistance (half damage)</SelectItem>
                <SelectItem value="immune">Immune (no damage)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-stone-500 mt-1">
              Apply damage reduction, resistance, or immunity to a damage type
            </p>
          </div>

          {formData.damageModifierType !== 'none' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-stone-300">Damage Type</Label>
                <Select
                  value={formData.damageModifierDamageType}
                  onValueChange={(value) => setFormData({ ...formData, damageModifierDamageType: value })}
                >
                  <SelectTrigger className="bg-stone-800 border-stone-700 mt-1" data-testid="select-damage-modifier-damage-type">
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {DAMAGE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {formData.damageModifierType === 'reduce' && (
                <div>
                  <Label className="text-stone-300">Reduction Value</Label>
                  <Input
                    type="number"
                    min={1}
                    value={formData.damageModifierValue}
                    onChange={(e) => setFormData({ ...formData, damageModifierValue: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="bg-stone-800 border-stone-700 mt-1"
                    data-testid="input-damage-modifier-value"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-stone-700"
            data-testid="button-cancel-trait"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading}
            className="bg-rose-700 hover:bg-rose-600"
            data-testid="button-save-trait"
          >
            {isLoading ? 'Saving...' : (initialData ? 'Update' : 'Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TokenEffectsViewProps {
  effects: TokenEffect[];
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onAddEffect: () => void;
  onEditEffect: (effect: TokenEffect) => void;
  onDeleteEffect: (id: string) => void;
}

const TOKEN_EFFECT_DAMAGE_TYPES = ['Sharp', 'Blunt', 'Piercing', 'Flame', 'Frost', 'Storm', 'Tide', 'Stone', 'Flux', 'Light', 'Dark', 'Sound', 'Poison'];

function TokenEffectsView({ effects, isLoading, searchQuery, setSearchQuery, onAddEffect, onEditEffect, onDeleteEffect }: TokenEffectsViewProps) {
  return (
    <Card className="bg-stone-900 border-stone-700 flex-1 flex flex-col min-h-0">
      <CardHeader className="flex flex-row items-center justify-between shrink-0">
        <CardTitle className="text-violet-500">Token Effects</CardTitle>
        <Button
          onClick={onAddEffect}
          className="bg-violet-700 hover:bg-violet-600"
          data-testid="button-add-effect"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Effect
        </Button>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0">
        <div className="mb-4 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
            <Input
              placeholder="Search effects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-stone-800 border-stone-700"
              data-testid="input-search-effects"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-stone-400">Loading effects...</div>
        ) : effects.length === 0 ? (
          <div className="text-center py-12 text-stone-400">
            <Flame className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-bold">No token effects found</p>
            <p className="text-sm mt-2">Create status effects that can be applied to tokens</p>
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-2">
              {effects.map((effect: TokenEffect) => (
                <div
                  key={effect.id}
                  className="flex items-center gap-4 p-3 rounded-lg bg-stone-800 border border-stone-700 hover:border-stone-600"
                  data-testid={`effect-row-${effect.id}`}
                >
                  <div className="h-12 w-12 rounded bg-stone-700 flex items-center justify-center overflow-hidden">
                    {effect.imageUrl ? (
                      <img src={effect.imageUrl} alt={effect.name} className="h-full w-full object-cover" />
                    ) : (
                      <Flame className="h-6 w-6 text-violet-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{effect.name}</span>
                      <Badge className={effect.timing === 'start_of_round' ? 'bg-blue-600 text-xs' : 'bg-orange-600 text-xs'}>
                        {effect.timing === 'start_of_round' ? 'Start of Round' : 'Start of Turn'}
                      </Badge>
                    </div>
                    <div className="text-sm text-stone-400 flex flex-wrap gap-2">
                      {effect.causesDamage && effect.diceAmount && (
                        <span>Damage: {effect.diceAmount} {effect.damageType}</span>
                      )}
                      {effect.description && (
                        <span className="truncate">{effect.description}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEditEffect(effect)}
                      className="text-stone-400 hover:text-violet-500"
                      data-testid={`button-edit-effect-${effect.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDeleteEffect(effect.id)}
                      className="text-stone-400 hover:text-red-500"
                      data-testid={`button-delete-effect-${effect.id}`}
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

interface TokenEffectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<TokenEffect>) => void;
  initialData?: TokenEffect;
  isLoading?: boolean;
}

function TokenEffectFormDialog({ open, onOpenChange, onSave, initialData, isLoading }: TokenEffectFormDialogProps) {
  const [formData, setFormData] = useState<{
    name: string;
    imageUrl: string;
    description: string;
    timing: string;
    causesDamage: boolean;
    damageType: string;
    diceAmount: string;
  }>({
    name: initialData?.name || '',
    imageUrl: initialData?.imageUrl || '',
    description: initialData?.description || '',
    timing: initialData?.timing || 'start_of_turn',
    causesDamage: initialData?.causesDamage || false,
    damageType: initialData?.damageType || '',
    diceAmount: initialData?.diceAmount || '',
  });

  const [showImageBrowser, setShowImageBrowser] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        imageUrl: initialData.imageUrl || '',
        description: initialData.description || '',
        timing: initialData.timing || 'start_of_turn',
        causesDamage: initialData.causesDamage || false,
        damageType: initialData.damageType || '',
        diceAmount: initialData.diceAmount || '',
      });
    } else {
      setFormData({
        name: '',
        imageUrl: '',
        description: '',
        timing: 'start_of_turn',
        causesDamage: false,
        damageType: '',
        diceAmount: '',
      });
    }
  }, [initialData, open]);

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast({ title: 'Error', description: 'Effect name is required', variant: 'destructive' });
      return;
    }
    if (formData.causesDamage && !formData.damageType) {
      toast({ title: 'Error', description: 'Damage type is required when effect causes damage', variant: 'destructive' });
      return;
    }
    if (formData.causesDamage && !formData.diceAmount) {
      toast({ title: 'Error', description: 'Dice amount is required when effect causes damage', variant: 'destructive' });
      return;
    }
    onSave({
      name: formData.name.trim(),
      imageUrl: formData.imageUrl.trim() || null,
      description: formData.description.trim() || null,
      timing: formData.timing,
      causesDamage: formData.causesDamage,
      damageType: formData.causesDamage ? formData.damageType : null,
      diceAmount: formData.causesDamage ? formData.diceAmount.trim() : null,
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-stone-900 border-stone-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-violet-500">
              {initialData ? 'Edit Token Effect' : 'Create Token Effect'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-stone-300">Effect Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Burning, Poisoned, Stunned"
                className="bg-stone-800 border-stone-700 mt-1"
                data-testid="input-effect-name"
              />
            </div>

            <div>
              <Label className="text-stone-300">Image URL</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  placeholder="https://example.com/image.png"
                  className="bg-stone-800 border-stone-700 flex-1"
                  data-testid="input-effect-image"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowImageBrowser(true)}
                  className="border-stone-700"
                  data-testid="button-browse-image"
                >
                  <Library className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div>
              <Label className="text-stone-300">Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe what this effect does..."
                className="bg-stone-800 border-stone-700 mt-1"
                rows={3}
                data-testid="input-effect-description"
              />
            </div>

            <div>
              <Label className="text-stone-300">Timing</Label>
              <Select
                value={formData.timing}
                onValueChange={(value) => setFormData({ ...formData, timing: value })}
              >
                <SelectTrigger className="bg-stone-800 border-stone-700 mt-1" data-testid="select-effect-timing">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="start_of_turn">Start of Turn</SelectItem>
                  <SelectItem value="start_of_round">Start of Round</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-stone-500 mt-1">
                When the effect triggers during combat
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="causesDamage"
                checked={formData.causesDamage}
                onCheckedChange={(checked) => setFormData({ ...formData, causesDamage: !!checked })}
                data-testid="checkbox-causes-damage"
              />
              <Label htmlFor="causesDamage" className="text-stone-300 cursor-pointer">
                Causes Damage
              </Label>
            </div>

            {formData.causesDamage && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-stone-300">Damage Type</Label>
                  <Select
                    value={formData.damageType}
                    onValueChange={(value) => setFormData({ ...formData, damageType: value })}
                  >
                    <SelectTrigger className="bg-stone-800 border-stone-700 mt-1" data-testid="select-damage-type">
                      <SelectValue placeholder="Select type..." />
                    </SelectTrigger>
                    <SelectContent>
                      {TOKEN_EFFECT_DAMAGE_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-stone-300">Dice Amount</Label>
                  <Input
                    value={formData.diceAmount}
                    onChange={(e) => setFormData({ ...formData, diceAmount: e.target.value })}
                    placeholder="e.g. 1d6, 2d4"
                    className="bg-stone-800 border-stone-700 mt-1"
                    data-testid="input-dice-amount"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-stone-700"
              data-testid="button-cancel-effect"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isLoading}
              className="bg-violet-700 hover:bg-violet-600"
              data-testid="button-save-effect"
            >
              {isLoading ? 'Saving...' : (initialData ? 'Update' : 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImageBrowser
        open={showImageBrowser}
        onOpenChange={(open) => !open && setShowImageBrowser(false)}
        onSelect={(url) => {
          setFormData({ ...formData, imageUrl: url });
          setShowImageBrowser(false);
        }}
      />
    </>
  );
}

interface CharactersViewProps {
  characters: Character[];
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onAddCharacter: () => void;
  onEditCharacter: (character: Character) => void;
  onDeleteCharacter: (id: string) => void;
  onViewSheet: (character: Character) => void;
}

function CharactersView({ characters, isLoading, searchQuery, setSearchQuery, onAddCharacter, onEditCharacter, onDeleteCharacter, onViewSheet }: CharactersViewProps) {
  return (
    <Card className="bg-stone-900 border-stone-700 flex-1 flex flex-col min-h-0">
      <CardHeader className="flex flex-row items-center justify-between shrink-0">
        <CardTitle className="text-teal-500">Character Templates</CardTitle>
        <Button
          onClick={onAddCharacter}
          className="bg-teal-700 hover:bg-teal-600"
          data-testid="button-add-character"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Character
        </Button>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0">
        <div className="mb-4 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
            <Input
              placeholder="Search characters..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-stone-800 border-stone-700"
              data-testid="input-search-characters"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-stone-400">Loading characters...</div>
        ) : characters.length === 0 ? (
          <div className="text-center py-12 text-stone-400">
            <User className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-bold">No character templates found</p>
            <p className="text-sm mt-2">Create reusable character templates for quick character creation</p>
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {characters.map((character: Character) => (
                <div
                  key={character.id}
                  className="p-4 rounded-lg bg-stone-800 border border-stone-700 hover:border-teal-600 transition-colors cursor-pointer"
                  data-testid={`character-card-${character.id}`}
                  onClick={() => onViewSheet(character)}
                >
                  <div className="flex items-start gap-3">
                    {character.portrait ? (
                      <img src={character.portrait} alt={character.name} className="h-16 w-16 rounded-lg object-cover" />
                    ) : (
                      <div className="h-16 w-16 rounded-lg bg-stone-700 flex items-center justify-center">
                        <User className="h-8 w-8 text-teal-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-stone-200 truncate">{character.name}</h3>
                      <p className="text-sm text-stone-400">Level {character.level || 1}</p>
                      <p className="text-sm text-teal-400">{character.race || 'Unknown Race'}</p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-stone-700">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); onViewSheet(character); }}
                      className="text-stone-400 hover:text-teal-500"
                      data-testid={`button-view-sheet-${character.id}`}
                    >
                      <User className="h-4 w-4 mr-1" />
                      Open Sheet
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); onEditCharacter(character); }}
                      className="text-stone-400 hover:text-stone-300"
                      data-testid={`button-edit-character-${character.id}`}
                    >
                      <Pencil className="h-4 w-4 mr-1" />
                      Rename
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); onDeleteCharacter(character.id); }}
                      className="text-stone-400 hover:text-red-500"
                      data-testid={`button-delete-character-${character.id}`}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
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

interface CharacterFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<Character>) => void;
  initialData?: Character;
  isLoading?: boolean;
}

function CharacterFormDialog({ open, onOpenChange, onSave, initialData, isLoading }: CharacterFormDialogProps) {
  const [name, setName] = useState(initialData?.name || "");
  const [selectedRace, setSelectedRace] = useState(initialData?.race || "Human");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: systemSpeciesList = [] } = useQuery({
    queryKey: ['species'],
    queryFn: () => api.getSpecies('Arcana Adventure'),
    enabled: open,
  });

  const selectedSpecies = systemSpeciesList.find((s: any) => s.name === selectedRace) || {
    name: "Human",
    size: "Medium",
    naturalArmor: 5,
    sizeBonus: 0,
    speed: 30,
    flySpeed: 0,
    startingHp: 10,
    startingMaxHp: 10,
    startingEnergy: 10,
    startingMaxEnergy: 10,
    featTree: ""
  };

  useEffect(() => {
    if (open) {
      setName(initialData?.name || "");
      setSelectedRace(initialData?.race || "Human");
    }
  }, [initialData, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;
    
    setIsSubmitting(true);
    
    onSave({
      name: name.trim(),
      level: 1,
      class: "",
      race: selectedSpecies.name,
      size: selectedSpecies.size || "Medium",
      naturalArmor: selectedSpecies.naturalArmor || 5,
      sizeBonus: selectedSpecies.sizeBonus || 0,
      speed: selectedSpecies.speed || 30,
      flySpeed: selectedSpecies.flySpeed || 0,
      featTree: selectedSpecies.featTree || "",
      hp: selectedSpecies.startingHp || 10,
      maxHp: selectedSpecies.startingMaxHp || 10,
      energy: selectedSpecies.startingEnergy || 10,
      maxEnergy: selectedSpecies.startingMaxEnergy || 10,
      bonusHpFromLevelUps: 0,
      lastLevelUpRolled: 1,
      might: 0,
      finesse: 0,
      wit: 0,
      presence: 0,
      will: 0,
      craft: 0,
      skillAgility: 0,
      skillArcana: 0,
      skillCharisma: 0,
      skillConcentration: 0,
      skillDeception: 0,
      skillHistory: 0,
      skillIntimidation: 0,
      skillInvestigation: 0,
      skillMedicine: 0,
      skillPerception: 0,
      skillSleightOfHand: 0,
      skillStealth: 0,
      skillStrength: 0,
      skillWisdom: 0,
      skillCulture: 0,
    } as Partial<Character>);
    
    setName("");
    setSelectedRace("Human");
    setIsSubmitting(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) {
        setName("");
        setSelectedRace("Human");
      }
      onOpenChange(open);
    }}>
      <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-teal-500 font-display text-2xl">
            {initialData ? 'Edit Character Template' : 'Create Character Template'}
          </DialogTitle>
          <DialogDescription className="text-stone-400">
            Enter a name and select a race. You can customize everything else in the character sheet after adding to a campaign.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="char-name" className="text-stone-300">Character Name</Label>
            <Input
              id="char-name"
              data-testid="input-character-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-stone-800 border-stone-700 text-stone-200"
              placeholder="Enter character name..."
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="char-race" className="text-stone-300">Race</Label>
            <Select value={selectedRace} onValueChange={setSelectedRace}>
              <SelectTrigger className="bg-stone-800 border-stone-700 text-stone-200" data-testid="select-character-race">
                <SelectValue placeholder="Select a race" />
              </SelectTrigger>
              <SelectContent className="bg-stone-800 border-stone-700">
                {systemSpeciesList.length > 0 ? (
                  systemSpeciesList.map((species: any) => (
                    <SelectItem key={species.id} value={species.name} className="text-stone-200">
                      {species.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="Human" className="text-stone-200">Human</SelectItem>
                )}
              </SelectContent>
            </Select>
            {selectedSpecies && (
              <p className="text-xs text-stone-500">
                HP: {selectedSpecies.startingMaxHp || 10} | Energy: {selectedSpecies.startingMaxEnergy || 10} | Speed: {selectedSpecies.speed || 30}ft
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="border-stone-600">
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || isSubmitting || isLoading} className="bg-teal-700 hover:bg-teal-600">
              {isLoading ? 'Saving...' : (initialData ? 'Update' : 'Create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
  energy_bonus: Zap,
  dc_bonus: ShieldCheck,
  spell_grant: BookOpen,
  skill_bonus: Star,
  attribute_bonus: Sparkles,
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
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
    onSettled: (_data, _error, variables) => {
      // Clear only the pending drag update for this specific feat
      setPendingDragUpdates(prev => {
        const next = new Map(prev);
        next.delete(variables.id);
        return next;
      });
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
  // Track pending position updates per feat to keep visual offset until each mutation completes
  const [pendingDragUpdates, setPendingDragUpdates] = useState<Map<string, { dx: number; dy: number }>>(new Map());

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
    // Don't start a new drag if there's a pending update for this feat
    if (pendingDragUpdates.has(feat.id)) return;
    
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
      
      // Keep the visual offset until mutation completes to prevent snap-back
      setPendingDragUpdates(prev => new Map(prev).set(feat.id, { dx, dy }));
      
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
    const container = canvasContainerRef.current;
    if (!container) return;
    
    // Get initial size immediately
    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setViewportSize(prev => {
        if (prev.width !== rect.width || prev.height !== rect.height) {
          return { width: rect.width, height: rect.height };
        }
        return prev;
      });
    }
    
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
    
    observer.observe(container);
    return () => observer.disconnect();
  }, [selectedTreeId]);

  // Reset view when tree changes - use default view if set (world-space coordinates)
  useEffect(() => {
    if (selectedTreeId && viewportSize.width > 0 && treeData) {
      // Use default view if set (stored as world-space center coordinates)
      if (treeData.tree?.defaultViewX != null && treeData.tree?.defaultViewY != null) {
        const worldCenterX = treeData.tree.defaultViewX;
        const worldCenterY = treeData.tree.defaultViewY;
        const defaultZoom = treeData.tree.defaultViewZoom || 1;
        
        // Convert world-space center to viewport-relative pan
        const panX = viewportSize.width / 2 - worldCenterX * defaultZoom;
        const panY = viewportSize.height / 2 - worldCenterY * defaultZoom;
        
        panRef.current = { x: panX, y: panY };
        zoomRef.current = defaultZoom;
        motionX.set(panX);
        motionY.set(panY);
        motionZoom.set(defaultZoom);
        forceUpdate(n => n + 1);
        return;
      }
      
      // Fallback: Center on origin (0,0)
      const centerX = viewportSize.width / 2;
      const centerY = viewportSize.height / 2;
      panRef.current = { x: centerX, y: centerY };
      zoomRef.current = 1;
      motionX.set(centerX);
      motionY.set(centerY);
      motionZoom.set(1);
      forceUpdate(n => n + 1);
    }
  }, [selectedTreeId, viewportSize.width, treeData?.tree?.defaultViewX, treeData?.tree?.defaultViewY]);

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
  }, [selectedTreeId, viewportSize.width, motionX, motionY, motionZoom]);

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
  }, [selectedTreeId, viewportSize.width]);

  // Pointer handlers for panning
  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (isPinching) return;
    if (gestureModeRef.current !== 'idle') return;
    
    // Only pan with left mouse button or touch
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    
    // Don't start pan if clicking on a feat or connection delete button
    const target = e.target as HTMLElement;
    if (target.closest('[data-feat-cell]')) return;
    if (target.closest('[data-connection-delete]')) return;
    
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
      // Use default view if set (world-space coordinates), otherwise center on the first feat
      if (treeData.tree?.defaultViewX != null && treeData.tree?.defaultViewY != null) {
        const worldCenterX = treeData.tree.defaultViewX;
        const worldCenterY = treeData.tree.defaultViewY;
        const defaultZoom = treeData.tree.defaultViewZoom || 1;
        
        // Convert world-space center to viewport-relative pan
        const panX = viewportSize.width / 2 - worldCenterX * defaultZoom;
        const panY = viewportSize.height / 2 - worldCenterY * defaultZoom;
        
        panRef.current = { x: panX, y: panY };
        zoomRef.current = defaultZoom;
        motionX.set(panX);
        motionY.set(panY);
        motionZoom.set(defaultZoom);
        forceUpdate(n => n + 1);
        return;
      }
      
      // Fallback: Center on the first feat, or origin if no feats
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
    
    // Ensure minimum curvature offset to avoid invisible lines when dx or dy is 0
    const minOffset = 40;
    const curvature = Math.max(minOffset, Math.min(distance * 0.3, 100));
    
    // Control points for bezier curve
    // When dx is 0 (vertical line), offset control points horizontally
    // When dy is 0 (horizontal line), offset control points vertically
    const horizontalOffset = Math.abs(dx) < 10 ? minOffset : dx * 0.25;
    const verticalOffset = curvature * (dy >= 0 ? 0.5 : -0.5);
    
    const cx1 = x1 + horizontalOffset;
    const cy1 = y1 + verticalOffset;
    const cx2 = x2 - horizontalOffset;
    const cy2 = y2 - verticalOffset;
    
    return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
  };

  const renderSkillTree = () => {
    if (!treeData) return null;
    
    const { feats, connections } = treeData;
    const featById = new Map<string, Feat>();
    feats.forEach((f: Feat) => featById.set(f.id, f));

    return (
      <div className="space-y-3">
        {/* Toolbar - moved outside canvas */}
        <div className="flex flex-wrap gap-2 items-center">
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
            className="bg-stone-800/80 hover:bg-stone-700 text-xs border border-stone-600"
            onClick={resetView}
            title="Reset to default view"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Reset View
          </Button>
          <Button 
            size="sm" 
            variant="secondary" 
            className="bg-amber-800/80 hover:bg-amber-700 text-xs border border-amber-600"
            onClick={() => {
              if (selectedTreeId && viewportSize.width > 0) {
                // Store world-space center coordinates instead of viewport-relative pan
                const zoom = zoomRef.current;
                const pan = panRef.current;
                const worldCenterX = (viewportSize.width / 2 - pan.x) / zoom;
                const worldCenterY = (viewportSize.height / 2 - pan.y) / zoom;
                
                updateTreeMutation.mutate({
                  id: selectedTreeId,
                  data: {
                    defaultViewX: Math.round(worldCenterX),
                    defaultViewY: Math.round(worldCenterY),
                    defaultViewZoom: Math.round(zoom * 100) / 100,
                  },
                });
                toast({ title: 'Default View Set', description: 'Current view saved as default' });
              }
            }}
            title="Save current view as default"
          >
            <Save className="h-3 w-3 mr-1" />
            Set Default View
          </Button>
          
          {/* Connection mode indicator */}
          {connectionMode && (
            <div className="flex items-center gap-2 bg-purple-600/90 backdrop-blur px-3 py-1.5 rounded-lg text-sm shadow-lg ml-auto">
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
        </div>

        {/* Canvas container */}
        <div 
          ref={canvasContainerRef}
          className={`relative w-full h-[600px] overflow-hidden rounded-lg border border-stone-700 ${
            connectionMode ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
          }`}
          style={{ 
            touchAction: 'none',
            background: 'radial-gradient(ellipse at center, #1c1917 0%, #0c0a09 100%)',
            userSelect: 'none',
            WebkitUserSelect: 'none'
          }}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerUp}
          onClick={handleCanvasClick}
        >
        
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
            className="absolute"
            style={{ 
              width: WORLD_SIZE, 
              height: WORLD_SIZE,
              left: 0,
              top: 0,
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
              
              // Convert grid indices to pixels and apply drag/pending offset if node is being dragged
              let fromX = from.gridX * CELL_SIZE;
              let fromY = from.gridY * CELL_SIZE;
              let toX = to.gridX * CELL_SIZE;
              let toY = to.gridY * CELL_SIZE;
              
              const fromPending = pendingDragUpdates.get(from.id);
              const toPending = pendingDragUpdates.get(to.id);
              
              if (dragOffset?.id === from.id) {
                fromX += dragOffset.dx;
                fromY += dragOffset.dy;
              } else if (fromPending) {
                fromX += fromPending.dx;
                fromY += fromPending.dy;
              }
              if (dragOffset?.id === to.id) {
                toX += dragOffset.dx;
                toY += dragOffset.dy;
              } else if (toPending) {
                toX += toPending.dx;
                toY += toPending.dy;
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
                    className="transition-all pointer-events-none"
                  />
                  <circle
                    cx={midX}
                    cy={midY}
                    r={14}
                    fill="#1c1917"
                    stroke="#78716c"
                    strokeWidth={2}
                    className="cursor-pointer hover:stroke-red-500 hover:fill-red-900/50 transition-colors"
                    style={{ pointerEvents: 'all' }}
                    data-connection-delete="true"
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
            const isDragging = dragOffset?.id === feat.id;
            const pendingUpdate = pendingDragUpdates.get(feat.id);
            
            // Convert grid indices to pixels and apply drag offset (or pending update offset)
            let posX = feat.gridX * CELL_SIZE;
            let posY = feat.gridY * CELL_SIZE;
            if (isDragging) {
              posX += dragOffset.dx;
              posY += dragOffset.dy;
            } else if (pendingUpdate) {
              // Keep visual offset while mutation is pending
              posX += pendingUpdate.dx;
              posY += pendingUpdate.dy;
            }
            
            return (
              <div
                key={feat.id}
                data-feat-cell
                className={`
                  absolute rounded-xl border-2 
                  ${featNodeStyle.border} ${featNodeStyle.bg} ${featNodeStyle.glow}
                  ${isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-stone-900 scale-105' : ''}
                  ${isConnectSource ? 'animate-pulse ring-2 ring-purple-400' : ''}
                  ${connectionMode ? 'cursor-crosshair' : 'cursor-move'}
                  ${!isDragging ? 'transition-transform duration-150 hover:scale-105' : ''}
                `}
                style={{
                  left: WORLD_OFFSET + posX,
                  top: WORLD_OFFSET + posY,
                  width: NODE_WIDTH,
                  height: NODE_HEIGHT,
                  willChange: isDragging ? 'left, top' : 'auto',
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
                  <div className="text-[10px] text-amber-400 mt-1 font-medium">
                    Cost: {feat.cost || 1}
                  </div>
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
        </div>

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

const EFFECT_TYPE_ICONS: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  hp_bonus: { icon: Heart, color: 'text-red-400' },
  energy_bonus: { icon: Zap, color: 'text-blue-400' },
  dc_bonus: { icon: ShieldCheck, color: 'text-amber-400' },
  skill_bonus: { icon: Star, color: 'text-green-400' },
  attribute_bonus: { icon: Star, color: 'text-purple-400' },
  spell_grant: { icon: BookOpen, color: 'text-cyan-400' },
  item_grant: { icon: Package, color: 'text-orange-400' },
  skill_grant: { icon: Sparkles, color: 'text-pink-400' },
  trait_grant: { icon: Wand2, color: 'text-violet-400' },
};

interface TemplateSelectorProps {
  templates: FeatTemplate[];
  onSelect: (template: FeatTemplate) => void;
}

function TemplateSelector({ templates, onSelect }: TemplateSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  
  const filteredTemplates = useMemo(() => {
    if (!searchQuery.trim()) return templates;
    const query = searchQuery.toLowerCase();
    return templates.filter(t => 
      t.name.toLowerCase().includes(query) || 
      t.description?.toLowerCase().includes(query)
    );
  }, [templates, searchQuery]);

  const getEffectBadges = (effects: any[] | null | undefined) => {
    if (!effects || effects.length === 0) return null;
    const uniqueTypes = [...new Set(effects.map((e: any) => e.type))];
    return uniqueTypes.slice(0, 4).map((type, idx) => {
      const config = EFFECT_TYPE_ICONS[type as string];
      if (!config) return null;
      const Icon = config.icon;
      return (
        <Icon key={idx} className={`h-3 w-3 ${config.color}`} />
      );
    });
  };

  return (
    <div className="p-3 bg-purple-900/30 border-2 border-purple-500 rounded-lg mb-2 shadow-lg shadow-purple-900/20">
      <div className="flex items-center gap-2 mb-2">
        <Library className="h-4 w-4 text-purple-400" />
        <Label className="text-sm font-medium text-purple-300">Feat Library</Label>
        <Badge variant="secondary" className="ml-auto text-xs">{templates.length} templates</Badge>
      </div>
      <div className="relative mb-2">
        <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-stone-500" />
        <Input
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-7 h-8 text-xs bg-stone-800 border-stone-700"
          data-testid="input-template-search"
        />
      </div>
      <ScrollArea className="h-48">
        <div className="space-y-1 pr-2">
          {filteredTemplates.length === 0 ? (
            <div className="text-center py-4 text-stone-500 text-xs">
              No templates found
            </div>
          ) : (
            filteredTemplates.map((template) => (
              <Button
                key={template.id}
                variant="ghost"
                className="w-full justify-start text-left h-auto py-2 px-2 hover:bg-purple-800/30"
                onClick={() => onSelect(template)}
              >
                <div className="flex items-center gap-2 w-full">
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-medium text-sm">{template.name}</span>
                    {template.description && (
                      <span className="text-xs text-stone-400 truncate max-w-[220px]">
                        {template.description}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {getEffectBadges(template.effects)}
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    T{template.tier}
                  </Badge>
                </div>
              </Button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
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

  // Picker dialog states
  const [showSpellPicker, setShowSpellPicker] = useState(false);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [showTraitPicker, setShowTraitPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  // Query system spells for spell_grant dropdown
  const { data: systemSpells = [] } = useQuery({
    queryKey: ['admin-spells'],
    queryFn: () => api.getSystemSpells(),
    enabled: open,
  });

  // Query custom skills for skill_grant dropdown
  const { data: customSkills = [] } = useQuery({
    queryKey: ['admin-skills'],
    queryFn: () => api.getSystemSkills(),
    enabled: open,
  });

  // Query system items for item_grant dropdown
  const { data: systemItems = [] } = useQuery<any[]>({
    queryKey: ['/api/system-items'],
    enabled: open,
  });

  // Query system traits for trait_grant dropdown
  const { data: systemTraitsForDropdown = [] } = useQuery({
    queryKey: ['admin-traits'],
    queryFn: () => api.getSystemTraits(),
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
    // Value validation: require non-zero for most types except spell_grant, item_grant, skill_grant, trait_grant
    // Also allow hp_bonus with target (for per-level dice expressions)
    const requiresValue = newEffect.type !== 'spell_grant' && 
                          newEffect.type !== 'item_grant' &&
                          newEffect.type !== 'skill_grant' &&
                          newEffect.type !== 'trait_grant' &&
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
    if (newEffect.type === 'skill_grant' && !newEffect.target) {
      toast({ title: 'Error', description: 'Please select a skill', variant: 'destructive' });
      return;
    }
    if (newEffect.type === 'trait_grant' && !newEffect.target) {
      toast({ title: 'Error', description: 'Please select a trait', variant: 'destructive' });
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
          <TemplateSelector 
            templates={featTemplates}
            onSelect={(template) => {
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
          />
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
                  if (effect.type === 'skill_grant') {
                    const skill = (customSkills as SystemSkill[]).find(s => s.id === target);
                    return skill ? `Grants: ${skill.name}` : target || '(select skill)';
                  }
                  if (effect.type === 'item_grant') {
                    const item = systemItems.find((i: any) => i.id === target);
                    return item ? `Grants: ${item.name}` : target || '(select item)';
                  }
                  if (effect.type === 'trait_grant') {
                    const trait = (systemTraitsForDropdown as SystemTrait[]).find(t => t.id === target);
                    return trait ? `Grants: ${trait.name}` : target || '(select trait)';
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
                    onValueChange={(v) => setNewEffect({ ...newEffect, type: v, target: '', subtype: (v === 'hp_bonus' || v === 'energy_bonus') ? 'flat' : undefined })}
                  >
                    <SelectTrigger className="bg-stone-800 border-stone-700 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hp_bonus">HP Bonus</SelectItem>
                      <SelectItem value="energy_bonus">Energy Bonus</SelectItem>
                      <SelectItem value="dc_bonus">DC Bonus</SelectItem>
                      <SelectItem value="skill_bonus">Skill Bonus</SelectItem>
                      <SelectItem value="attribute_bonus">Attribute Bonus</SelectItem>
                      <SelectItem value="spell_grant">Grant Spell</SelectItem>
                      <SelectItem value="item_grant">Grant Item</SelectItem>
                      <SelectItem value="skill_grant">Grant Custom Skill</SelectItem>
                      <SelectItem value="trait_grant">Grant Trait</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Value input - shown for all except spell/item/skill/trait grants */}
                  {newEffect.type !== 'spell_grant' && newEffect.type !== 'item_grant' && newEffect.type !== 'skill_grant' && newEffect.type !== 'trait_grant' && (
                    <Input
                      type="number"
                      value={newEffect.value}
                      onChange={(e) => setNewEffect({ ...newEffect, value: parseInt(e.target.value) || 0 })}
                      placeholder="Value"
                      className="bg-stone-800 border-stone-700 text-xs"
                    />
                  )}
                </div>

                {/* HP/Energy Bonus subtype selector */}
                {(newEffect.type === 'hp_bonus' || newEffect.type === 'energy_bonus') && (
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
                      {newEffect.subtype === 'per_level' 
                        ? `Adds ${newEffect.type === 'hp_bonus' ? 'HP' : 'Energy'} each level` 
                        : `One-time ${newEffect.type === 'hp_bonus' ? 'HP' : 'Energy'} boost`}
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

                {/* Spell selector - Searchable picker */}
                {newEffect.type === 'spell_grant' && (
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { setPickerSearch(''); setShowSpellPicker(true); }}
                      className="w-full justify-between bg-stone-800 border-stone-700 text-xs"
                    >
                      {newEffect.target ? (
                        <span className="flex items-center gap-2">
                          <BookOpen className="h-3 w-3 text-cyan-400" />
                          {(systemSpells as SystemSpell[]).find(s => s.id === newEffect.target)?.name || 'Select spell...'}
                        </span>
                      ) : (
                        <span className="text-stone-400">Select spell...</span>
                      )}
                      <Search className="h-3 w-3" />
                    </Button>
                    {/* Spell Picker Dialog */}
                    <Dialog open={showSpellPicker} onOpenChange={setShowSpellPicker}>
                      <DialogContent className="max-w-lg bg-stone-900 border-stone-700 max-h-[80vh] flex flex-col">
                        <DialogHeader>
                          <DialogTitle className="text-cyan-400 flex items-center gap-2">
                            <BookOpen className="h-5 w-5" />
                            Select Spell
                          </DialogTitle>
                        </DialogHeader>
                        <div className="relative mb-3">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
                          <Input
                            placeholder="Search spells..."
                            value={pickerSearch}
                            onChange={(e) => setPickerSearch(e.target.value)}
                            className="pl-9 bg-stone-800 border-stone-700"
                            autoFocus
                          />
                        </div>
                        <div className="overflow-y-auto max-h-[50vh] space-y-1 pr-2">
                          {(systemSpells as SystemSpell[]).length === 0 ? (
                            <div className="text-center py-8 text-stone-400">
                              <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
                              <p>No spells created yet</p>
                            </div>
                          ) : (
                            (systemSpells as SystemSpell[])
                              .filter(spell => spell.name.toLowerCase().includes(pickerSearch.toLowerCase()) ||
                                spell.description?.toLowerCase().includes(pickerSearch.toLowerCase()))
                              .map((spell) => (
                                <div
                                  key={spell.id}
                                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                                    newEffect.target === spell.id 
                                      ? 'bg-cyan-900/30 border-cyan-500' 
                                      : 'bg-stone-800 border-stone-700 hover:border-cyan-500'
                                  }`}
                                  onClick={() => {
                                    setNewEffect({ ...newEffect, target: spell.id });
                                    setShowSpellPicker(false);
                                  }}
                                >
                                  <div className="flex items-center gap-3">
                                    {spell.icon ? (
                                      <img src={spell.icon} alt="" className="w-8 h-8 rounded object-cover" />
                                    ) : (
                                      <div className="w-8 h-8 bg-stone-700 rounded flex items-center justify-center">
                                        <Sparkles className="h-4 w-4 text-cyan-400" />
                                      </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium text-stone-100">{spell.name}</span>
                                        <Badge variant="secondary" className="text-xs text-cyan-400">{spell.energyCost || 0}E</Badge>
                                      </div>
                                      {spell.description && (
                                        <p className="text-xs text-stone-400 truncate">{spell.description}</p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}

                {/* Item grant - Searchable picker */}
                {newEffect.type === 'item_grant' && (
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { setPickerSearch(''); setShowItemPicker(true); }}
                      className="w-full justify-between bg-stone-800 border-stone-700 text-xs"
                    >
                      {newEffect.target ? (
                        <span className="flex items-center gap-2">
                          <Package className="h-3 w-3 text-orange-400" />
                          {systemItems.find((i: any) => i.id === newEffect.target)?.name || 'Select item...'}
                        </span>
                      ) : (
                        <span className="text-stone-400">Select item...</span>
                      )}
                      <Search className="h-3 w-3" />
                    </Button>
                    {/* Item Picker Dialog */}
                    <Dialog open={showItemPicker} onOpenChange={setShowItemPicker}>
                      <DialogContent className="max-w-lg bg-stone-900 border-stone-700 max-h-[80vh] flex flex-col">
                        <DialogHeader>
                          <DialogTitle className="text-orange-400 flex items-center gap-2">
                            <Package className="h-5 w-5" />
                            Select Item
                          </DialogTitle>
                        </DialogHeader>
                        <div className="relative mb-3">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
                          <Input
                            placeholder="Search items..."
                            value={pickerSearch}
                            onChange={(e) => setPickerSearch(e.target.value)}
                            className="pl-9 bg-stone-800 border-stone-700"
                            autoFocus
                          />
                        </div>
                        <div className="overflow-y-auto max-h-[50vh] space-y-1 pr-2">
                          {systemItems.length === 0 ? (
                            <div className="text-center py-8 text-stone-400">
                              <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                              <p>No system items available</p>
                            </div>
                          ) : (
                            systemItems
                              .filter((item: any) => item.id && item.name?.toLowerCase().includes(pickerSearch.toLowerCase()))
                              .map((item: any) => (
                                <div
                                  key={item.id}
                                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                                    newEffect.target === item.id 
                                      ? 'bg-orange-900/30 border-orange-500' 
                                      : 'bg-stone-800 border-stone-700 hover:border-orange-500'
                                  }`}
                                  onClick={() => {
                                    setNewEffect({ ...newEffect, target: item.id });
                                    setShowItemPicker(false);
                                  }}
                                >
                                  <div className="flex items-center gap-3">
                                    {item.image ? (
                                      <img src={item.image} alt="" className="w-8 h-8 rounded object-cover" />
                                    ) : (
                                      <div className="w-8 h-8 bg-stone-700 rounded flex items-center justify-center">
                                        <Package className="h-4 w-4 text-orange-400" />
                                      </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium text-stone-100">{item.name}</span>
                                        {item.itemType && (
                                          <Badge variant="secondary" className="text-xs capitalize">{item.itemType}</Badge>
                                        )}
                                      </div>
                                      {item.description && (
                                        <p className="text-xs text-stone-400 truncate">{item.description}</p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}

                {/* Custom skill grant - Searchable picker */}
                {newEffect.type === 'skill_grant' && (
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { setPickerSearch(''); setShowSkillPicker(true); }}
                      className="w-full justify-between bg-stone-800 border-stone-700 text-xs"
                    >
                      {newEffect.target ? (
                        <span className="flex items-center gap-2">
                          <Sparkles className="h-3 w-3 text-pink-400" />
                          {(customSkills as SystemSkill[]).find(s => s.id === newEffect.target)?.name || 'Select skill...'}
                        </span>
                      ) : (
                        <span className="text-stone-400">Select custom skill...</span>
                      )}
                      <Search className="h-3 w-3" />
                    </Button>
                    {/* Skill Picker Dialog */}
                    <Dialog open={showSkillPicker} onOpenChange={setShowSkillPicker}>
                      <DialogContent className="max-w-lg bg-stone-900 border-stone-700 max-h-[80vh] flex flex-col">
                        <DialogHeader>
                          <DialogTitle className="text-pink-400 flex items-center gap-2">
                            <Sparkles className="h-5 w-5" />
                            Select Custom Skill
                          </DialogTitle>
                        </DialogHeader>
                        <div className="relative mb-3">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
                          <Input
                            placeholder="Search skills..."
                            value={pickerSearch}
                            onChange={(e) => setPickerSearch(e.target.value)}
                            className="pl-9 bg-stone-800 border-stone-700"
                            autoFocus
                          />
                        </div>
                        <div className="overflow-y-auto max-h-[50vh] space-y-1 pr-2">
                          {(customSkills as SystemSkill[]).length === 0 ? (
                            <div className="text-center py-8 text-stone-400">
                              <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-30" />
                              <p>No custom skills created yet</p>
                            </div>
                          ) : (
                            (customSkills as SystemSkill[])
                              .filter(skill => skill.name.toLowerCase().includes(pickerSearch.toLowerCase()) ||
                                skill.description?.toLowerCase().includes(pickerSearch.toLowerCase()))
                              .map((skill) => (
                                <div
                                  key={skill.id}
                                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                                    newEffect.target === skill.id 
                                      ? 'bg-pink-900/30 border-pink-500' 
                                      : 'bg-stone-800 border-stone-700 hover:border-pink-500'
                                  }`}
                                  onClick={() => {
                                    setNewEffect({ ...newEffect, target: skill.id });
                                    setShowSkillPicker(false);
                                  }}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-stone-700 rounded flex items-center justify-center">
                                      <Sparkles className="h-4 w-4 text-pink-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium text-stone-100">{skill.name}</span>
                                        <Badge variant="secondary" className="text-xs capitalize">{skill.parentAttribute}</Badge>
                                      </div>
                                      {skill.description && (
                                        <p className="text-xs text-stone-400 truncate">{skill.description}</p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}

                {/* Trait grant - Searchable picker */}
                {newEffect.type === 'trait_grant' && (
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { setPickerSearch(''); setShowTraitPicker(true); }}
                      className="w-full justify-between bg-stone-800 border-stone-700 text-xs"
                    >
                      {newEffect.target ? (
                        <span className="flex items-center gap-2">
                          <Wand2 className="h-3 w-3 text-violet-400" />
                          {(systemTraitsForDropdown as SystemTrait[]).find(t => t.id === newEffect.target)?.name || 'Select trait...'}
                        </span>
                      ) : (
                        <span className="text-stone-400">Select trait...</span>
                      )}
                      <Search className="h-3 w-3" />
                    </Button>
                    {/* Trait Picker Dialog */}
                    <Dialog open={showTraitPicker} onOpenChange={setShowTraitPicker}>
                      <DialogContent className="max-w-lg bg-stone-900 border-stone-700 max-h-[80vh] flex flex-col">
                        <DialogHeader>
                          <DialogTitle className="text-violet-400 flex items-center gap-2">
                            <Wand2 className="h-5 w-5" />
                            Select Trait
                          </DialogTitle>
                        </DialogHeader>
                        <div className="relative mb-3">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
                          <Input
                            placeholder="Search traits..."
                            value={pickerSearch}
                            onChange={(e) => setPickerSearch(e.target.value)}
                            className="pl-9 bg-stone-800 border-stone-700"
                            autoFocus
                          />
                        </div>
                        <div className="overflow-y-auto max-h-[50vh] space-y-1 pr-2">
                          {(systemTraitsForDropdown as SystemTrait[]).length === 0 ? (
                            <div className="text-center py-8 text-stone-400">
                              <Wand2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                              <p>No traits created yet</p>
                            </div>
                          ) : (
                            (systemTraitsForDropdown as SystemTrait[])
                              .filter(trait => trait.name.toLowerCase().includes(pickerSearch.toLowerCase()) ||
                                trait.description?.toLowerCase().includes(pickerSearch.toLowerCase()))
                              .map((trait) => (
                                <div
                                  key={trait.id}
                                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                                    newEffect.target === trait.id 
                                      ? 'bg-violet-900/30 border-violet-500' 
                                      : 'bg-stone-800 border-stone-700 hover:border-violet-500'
                                  }`}
                                  onClick={() => {
                                    setNewEffect({ ...newEffect, target: trait.id });
                                    setShowTraitPicker(false);
                                  }}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-stone-700 rounded flex items-center justify-center">
                                      <Wand2 className="h-4 w-4 text-violet-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium text-stone-100">{trait.name}</span>
                                        <Badge variant="secondary" className="text-xs capitalize">{trait.parentAttribute}</Badge>
                                      </div>
                                      {trait.description && (
                                        <p className="text-xs text-stone-400 truncate">{trait.description}</p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
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
    carryWeight: number | string;
    featTree: string;
  }>({
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
    carryWeight: initialData?.carryWeight ?? '',
    featTree: initialData?.featTree || '',
  });
  
  const [showSpeciesImageBrowser, setShowSpeciesImageBrowser] = useState(false);
  const speciesImageInputRef = useRef<HTMLInputElement>(null);
  
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
                      onChange={handleSpeciesImageUpload}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => speciesImageInputRef.current?.click()}
                      className="border-stone-600"
                    >
                      Upload Image
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowSpeciesImageBrowser(true)}
                      className="border-stone-600"
                      data-testid="button-species-browse-library"
                    >
                      <Library className="h-4 w-4 mr-1" />
                      Libraries
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-stone-500 mt-1">
                  This image will be used as the default token for characters of this species.
                </p>
              </div>

              <ImageBrowser
                open={showSpeciesImageBrowser}
                onOpenChange={setShowSpeciesImageBrowser}
                onSelect={(imageBase64) => {
                  setFormData({ ...formData, defaultImage: imageBase64 });
                  setShowSpeciesImageBrowser(false);
                }}
                title="Select Species Default Image"
              />

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

function SpellEffectsSection({ spellId }: { spellId: string }) {
  const { data: spellEffects, refetch } = useQuery({
    queryKey: ['spell-effects', spellId],
    queryFn: () => api.getSpellEffects(spellId),
  });

  const { data: allEffects } = useQuery({
    queryKey: ['token-effects'],
    queryFn: () => api.getTokenEffects(),
  });

  const [selectedEffectId, setSelectedEffectId] = useState('');
  const [triggerCondition, setTriggerCondition] = useState('always');

  const addMutation = useMutation({
    mutationFn: () => api.addSpellEffect(spellId, selectedEffectId, triggerCondition),
    onSuccess: () => {
      refetch();
      setSelectedEffectId('');
      toast({ title: 'Effect added' });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.removeSpellEffect(id),
    onSuccess: () => refetch(),
  });

  const availableEffects = allEffects?.filter(e => !spellEffects?.some(se => se.effectId === e.id)) || [];

  return (
    <div className="space-y-3">
      {spellEffects?.map(se => (
        <div key={se.id} className="flex items-center gap-2 p-2 bg-stone-800 rounded">
          {se.effect.imageUrl && <img src={se.effect.imageUrl} className="h-6 w-6 rounded" />}
          <span className="flex-1 text-sm">{se.effect.name}</span>
          <Badge variant="outline" className="text-xs">{se.triggerCondition}</Badge>
          <Button size="icon" variant="ghost" onClick={() => removeMutation.mutate(se.id)}>
            <X className="h-4 w-4 text-red-400" />
          </Button>
        </div>
      ))}

      {availableEffects.length > 0 && (
        <div className="flex gap-2">
          <Select value={selectedEffectId} onValueChange={setSelectedEffectId}>
            <SelectTrigger className="flex-1 bg-stone-800 border-stone-700">
              <SelectValue placeholder="Select effect" />
            </SelectTrigger>
            <SelectContent>
              {availableEffects.map(e => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={triggerCondition} onValueChange={setTriggerCondition}>
            <SelectTrigger className="w-32 bg-stone-800 border-stone-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="always">Always</SelectItem>
              <SelectItem value="success">On Success</SelectItem>
              <SelectItem value="failure">On Failure</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!selectedEffectId} onClick={() => addMutation.mutate()}>
            Add
          </Button>
        </div>
      )}

      {spellEffects?.length === 0 && availableEffects.length === 0 && (
        <p className="text-sm text-stone-500">No token effects defined. Create effects in the Token Effects section first.</p>
      )}
    </div>
  );
}

function ItemEffectsSection({ itemId }: { itemId: string }) {
  const { data: itemEffects, refetch } = useQuery({
    queryKey: ['item-effects', itemId],
    queryFn: () => api.getItemEffects(itemId),
  });

  const { data: allEffects } = useQuery({
    queryKey: ['token-effects'],
    queryFn: () => api.getTokenEffects(),
  });

  const [selectedEffectId, setSelectedEffectId] = useState('');
  const [triggerCondition, setTriggerCondition] = useState('always');

  const addMutation = useMutation({
    mutationFn: () => api.addItemEffect(itemId, selectedEffectId, triggerCondition),
    onSuccess: () => {
      refetch();
      setSelectedEffectId('');
      toast({ title: 'Effect added' });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.removeItemEffect(id),
    onSuccess: () => refetch(),
  });

  const availableEffects = allEffects?.filter(e => !itemEffects?.some(ie => ie.effectId === e.id)) || [];

  return (
    <div className="space-y-3">
      {itemEffects?.map(ie => (
        <div key={ie.id} className="flex items-center gap-2 p-2 bg-stone-800 rounded">
          {ie.effect.imageUrl && <img src={ie.effect.imageUrl} className="h-6 w-6 rounded" />}
          <span className="flex-1 text-sm">{ie.effect.name}</span>
          <Badge variant="outline" className="text-xs">{ie.triggerCondition}</Badge>
          <Button size="icon" variant="ghost" onClick={() => removeMutation.mutate(ie.id)}>
            <X className="h-4 w-4 text-red-400" />
          </Button>
        </div>
      ))}

      {availableEffects.length > 0 && (
        <div className="flex gap-2">
          <Select value={selectedEffectId} onValueChange={setSelectedEffectId}>
            <SelectTrigger className="flex-1 bg-stone-800 border-stone-700">
              <SelectValue placeholder="Select effect" />
            </SelectTrigger>
            <SelectContent>
              {availableEffects.map(e => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={triggerCondition} onValueChange={setTriggerCondition}>
            <SelectTrigger className="w-32 bg-stone-800 border-stone-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="always">Always</SelectItem>
              <SelectItem value="success">On Success</SelectItem>
              <SelectItem value="failure">On Failure</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!selectedEffectId} onClick={() => addMutation.mutate()}>
            Add
          </Button>
        </div>
      )}

      {itemEffects?.length === 0 && availableEffects.length === 0 && (
        <p className="text-sm text-stone-500">No token effects defined. Create effects in the Token Effects section first.</p>
      )}
    </div>
  );
}

interface SpellFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<SystemSpell>) => void;
  initialData?: SystemSpell;
  isLoading?: boolean;
}

const spellDamageTypes = ['Sharp', 'Blunt', 'Piercing', 'Flame', 'Frost', 'Storm', 'Tide', 'Stone', 'Flux', 'Light', 'Dark', 'Sound', 'Health', 'Energy'];
const spellAttributes = ['might', 'finesse', 'wit', 'presence', 'will', 'craft'];

function SpellFormDialog({ open, onOpenChange, onSave, initialData, isLoading }: SpellFormDialogProps) {
  // Normalize castingTime to new action format
  const normalizeCastingTime = (ct: string | undefined | null): string => {
    if (!ct) return 'action';
    const lower = ct.toLowerCase();
    if (lower.includes('bonus')) return 'bonus action';
    return 'action';
  };

  // Normalize duration to match dropdown options
  const normalizeDuration = (d: string | undefined | null): string => {
    if (!d) return 'Instant';
    // Check for common variations
    if (d.toLowerCase() === 'instantaneous' || d.toLowerCase() === 'instant') return 'Instant';
    return d;
  };

  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    icon: string;
    castingTime: string;
    range: number | string;
    duration: string;
    damageType: string;
    damageDice: string;
    attribute: string;
    energyCost: number | string;
    isAoe: boolean;
    aoeRange: number | string;
    aoeShape: string;
    isAttack: boolean;
    gainEnergy: boolean;
  }>({
    name: initialData?.name || '',
    description: initialData?.description || '',
    icon: initialData?.icon || '',
    castingTime: normalizeCastingTime(initialData?.castingTime),
    range: initialData?.rangeNum ?? 30,
    duration: normalizeDuration(initialData?.duration),
    damageType: initialData?.damageType || '',
    damageDice: initialData?.damageDice || '',
    attribute: initialData?.attribute || '',
    energyCost: initialData?.energyCost ?? 1,
    isAoe: initialData?.isAoe || false,
    aoeRange: initialData?.aoeRange ?? '',
    aoeShape: initialData?.aoeShape || '',
    isAttack: initialData?.isAttack !== false,
    gainEnergy: initialData?.gainEnergy || false,
  });

  const [showSpellImageBrowser, setShowSpellImageBrowser] = useState(false);
  const spellImageInputRef = useRef<HTMLInputElement>(null);

  const handleSpellImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setFormData({ ...formData, icon: event.target?.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        description: initialData.description || '',
        icon: initialData.icon || '',
        castingTime: normalizeCastingTime(initialData.castingTime),
        range: initialData.rangeNum ?? 30,
        duration: normalizeDuration(initialData.duration),
        damageType: initialData.damageType || '',
        damageDice: initialData.damageDice || '',
        attribute: initialData.attribute || '',
        energyCost: initialData.energyCost ?? 1,
        isAoe: initialData.isAoe || false,
        aoeRange: initialData.aoeRange ?? '',
        aoeShape: initialData.aoeShape || '',
        isAttack: initialData.isAttack !== false,
        gainEnergy: initialData.gainEnergy || false,
      });
    } else {
      setFormData({
        name: '',
        description: '',
        icon: '',
        castingTime: 'action',
        range: 30,
        duration: 'Instant',
        damageType: '',
        damageDice: '',
        attribute: '',
        energyCost: 1,
        isAoe: false,
        aoeRange: '',
        aoeShape: '',
        isAttack: true,
        gainEnergy: false,
      });
    }
  }, [initialData, open]);

  const handleNumericChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value === '' ? '' : parseInt(value) });
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ title: 'Error', description: 'Spell name is required', variant: 'destructive' });
      return;
    }
    if (formData.isAoe && !formData.aoeShape) {
      toast({ title: 'Error', description: 'Please select an AoE shape', variant: 'destructive' });
      return;
    }
    const normalizeNone = (val: string) => val === '_none' ? '' : val;
    const optionalNum = (val: string | number): number | undefined => {
      if (val === '' || val === undefined || val === null) return undefined;
      const num = Number(val);
      return isNaN(num) ? undefined : num;
    };
    onSave({
      name: formData.name,
      description: formData.description,
      icon: formData.icon || undefined,
      castingTime: formData.castingTime,
      range: `${formData.range} ft`,
      rangeNum: Number(formData.range) || 30,
      duration: formData.duration,
      damageType: normalizeNone(formData.damageType),
      damageDice: formData.damageDice,
      attribute: normalizeNone(formData.attribute),
      energyCost: Number(formData.energyCost) || 1,
      isAoe: formData.isAoe,
      aoeRange: formData.isAoe ? optionalNum(formData.aoeRange) : undefined,
      aoeShape: formData.isAoe ? formData.aoeShape : undefined,
      isAttack: formData.isAttack,
      gainEnergy: formData.damageType === 'Energy' ? formData.gainEnergy : false,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-blue-500">
            {initialData ? 'Edit Spell' : 'Create Spell'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-4 min-h-0">
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <div>
                <Label>Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-spell-name"
                />
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="bg-stone-800 border-stone-700 min-h-[60px]"
                  data-testid="textarea-spell-description"
                />
              </div>

              <div>
                <Label>Spell Icon</Label>
                <div className="flex items-center gap-4">
                  {formData.icon ? (
                    <div className="relative">
                      <img src={formData.icon} alt="Spell" className="h-16 w-16 rounded object-cover border border-stone-600" />
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, icon: '' })}
                        className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full h-5 w-5 text-xs flex items-center justify-center hover:bg-red-500"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div className="h-16 w-16 rounded border border-dashed border-stone-600 flex items-center justify-center text-stone-500">
                      <Sparkles className="h-6 w-6" />
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <input
                      ref={spellImageInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleSpellImageUpload}
                      data-testid="input-spell-icon"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => spellImageInputRef.current?.click()}
                      className="border-stone-600"
                      data-testid="button-upload-spell-icon"
                    >
                      Upload
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowSpellImageBrowser(true)}
                      className="border-stone-600"
                      data-testid="button-browse-spell-icon"
                    >
                      Browse Library
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Damage Dice</Label>
                  <Input
                    value={formData.damageDice}
                    onChange={(e) => setFormData({ ...formData, damageDice: e.target.value })}
                    placeholder="2d6"
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
              </div>

              {formData.damageType === 'Energy' && (
                <div className="flex items-center gap-2 p-2 bg-stone-800/50 rounded border border-cyan-800/50">
                  <Checkbox
                    id="gainEnergy"
                    checked={formData.gainEnergy}
                    onCheckedChange={(checked) => setFormData({ ...formData, gainEnergy: checked === true })}
                    data-testid="checkbox-gain-energy"
                  />
                  <Label htmlFor="gainEnergy" className="text-sm text-cyan-300 cursor-pointer">
                    Gain Energy? (If checked, roll adds energy instead of subtracting)
                  </Label>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Range (feet)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.range}
                    onChange={(e) => handleNumericChange('range', e.target.value)}
                    placeholder="30"
                    className="bg-stone-800 border-stone-700"
                    data-testid="input-spell-range"
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
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Action Type</Label>
                  <Select value={formData.castingTime} onValueChange={(v) => setFormData({ ...formData, castingTime: v })}>
                    <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-spell-action-type">
                      <SelectValue placeholder="Select action type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="action">Action</SelectItem>
                      <SelectItem value="bonus action">Bonus Action</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Duration</Label>
                  <Select value={formData.duration} onValueChange={(v) => setFormData({ ...formData, duration: v })}>
                    <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-spell-duration">
                      <SelectValue placeholder="Select duration" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Instant">Instant</SelectItem>
                      <SelectItem value="1 Round">1 Round</SelectItem>
                      <SelectItem value="1 Minute">1 Minute</SelectItem>
                      <SelectItem value="10 Minutes">10 Minutes</SelectItem>
                      <SelectItem value="30 Minutes">30 Minutes</SelectItem>
                      <SelectItem value="1 Hour">1 Hour</SelectItem>
                      <SelectItem value="6 Hours">6 Hours</SelectItem>
                      <SelectItem value="12 Hours">12 Hours</SelectItem>
                      <SelectItem value="1 Day">1 Day</SelectItem>
                      <SelectItem value="1 Week">1 Week</SelectItem>
                      <SelectItem value="1 Month">1 Month</SelectItem>
                      <SelectItem value="1 Year">1 Year</SelectItem>
                      <SelectItem value="Permanent">Permanent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="admin-spell-isattack"
                    checked={formData.isAttack}
                    onCheckedChange={(checked) => setFormData({ ...formData, isAttack: checked === true })}
                    className="border-stone-600"
                    data-testid="checkbox-spell-isattack"
                  />
                  <Label htmlFor="admin-spell-isattack" className="cursor-pointer">Attack?</Label>
                  <span className="text-xs text-stone-500">(Attack/Damage vs Use/Effect)</span>
                </div>
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="spell-aoe"
                    checked={formData.isAoe}
                    onCheckedChange={(checked) => setFormData({ ...formData, isAoe: checked === true })}
                    className="border-stone-600"
                    data-testid="checkbox-spell-aoe"
                  />
                  <Label htmlFor="spell-aoe" className="cursor-pointer">Area of Effect (AoE)</Label>
                </div>
                {formData.isAoe && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>AoE Shape</Label>
                      <Select value={formData.aoeShape || '_none'} onValueChange={(v) => setFormData({ ...formData, aoeShape: v === '_none' ? '' : v })}>
                        <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-spell-aoe-shape">
                          <SelectValue placeholder="Select shape" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">None</SelectItem>
                          <SelectItem value="circle">Circle</SelectItem>
                          <SelectItem value="square">Square</SelectItem>
                          <SelectItem value="cone">Cone</SelectItem>
                          <SelectItem value="line">Line</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>AoE Range (feet)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={formData.aoeRange}
                        onChange={(e) => handleNumericChange('aoeRange', e.target.value)}
                        placeholder="e.g. 15"
                        className="bg-stone-800 border-stone-700"
                        data-testid="input-spell-aoe-range"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {initialData && (
            <div className="border-t border-stone-700 pt-4 mt-4">
              <Label className="flex items-center gap-2 mb-3">
                <Flame className="h-4 w-4 text-violet-400" />
                Token Effects
              </Label>
              <SpellEffectsSection spellId={initialData.id} />
            </div>
          )}
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

      <ImageBrowser
        open={showSpellImageBrowser}
        onOpenChange={setShowSpellImageBrowser}
        onSelect={(imageBase64) => {
          setFormData({ ...formData, icon: imageBase64 });
          setShowSpellImageBrowser(false);
        }}
      />
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
    isDamaging: boolean;
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
    isDamaging: (initialData as any)?.isDamaging || false,
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
    // Helper to convert empty strings to undefined for optional numeric fields
    const optionalNum = (val: string | number): number | undefined => {
      if (val === '' || val === undefined || val === null) return undefined;
      const num = Number(val);
      return isNaN(num) ? undefined : num;
    };
    // Convert _none sentinel values back to empty strings for storage
    const normalizeNone = (val: string) => val === '_none' ? '' : val;
    const cleanedData = {
      ...formData,
      ammunitionType: normalizeNone(formData.ammunitionType),
      mod: optionalNum(formData.mod),
      range: optionalNum(formData.range),
      itemWeight: optionalNum(formData.itemWeight),
      durability: Number(formData.durability) || 10,
      price: optionalNum(formData.price),
      carryCapacity: optionalNum(formData.carryCapacity),
      quantity: Number(formData.quantity) || 1,
      breakChance: formData.itemType === 'ammunition' ? Number(formData.breakChance) || 10 : 10,
      aoe: formData.aoe === 'none' ? undefined : formData.aoe,
      armorBonus: formData.itemType === 'armor' ? optionalNum(formData.armorBonus) : undefined,
      damageReduction: formData.itemType === 'armor' ? optionalNum(formData.damageReduction) : undefined,
      armorSlot: formData.itemType === 'armor' ? formData.armorSlot : undefined,
      damageReductionType: formData.itemType === 'armor' ? formData.damageReductionType : undefined,
      rationServings: formData.itemType === 'consumable' ? optionalNum(formData.rationServings) : undefined,
      isDamaging: formData.itemType === 'consumable' ? formData.isDamaging : false,
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
                <div className="col-span-2 space-y-4">
                  <div>
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
                  <div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={formData.isDamaging}
                        onCheckedChange={(checked) => setFormData({ ...formData, isDamaging: !!checked })}
                        data-testid="checkbox-is-damaging"
                      />
                      <Label>Damaging Consumable</Label>
                    </div>
                    <p className="text-xs text-stone-500 mt-1">Damaging consumables can be rolled from the hotbar like weapons (click for attack roll, double-click for damage). Uses damage/type/mod/attribute fields above with 5ft range.</p>
                  </div>
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

            {initialData && formData.itemType === 'weapon' && (
              <div className="border-t border-stone-700 pt-4 mt-4">
                <Label className="flex items-center gap-2 mb-3">
                  <Flame className="h-4 w-4 text-violet-400" />
                  Token Effects
                </Label>
                <ItemEffectsSection itemId={initialData.id} />
              </div>
            )}
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
