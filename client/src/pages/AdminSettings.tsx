import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, useMotionValue } from 'framer-motion';
import { api, isV3SpellConflict, type Item, type Spell, type SystemSpecies, type FeatTree, type Feat, type FeatConnection, type FeatTreeWithData, type FeatTemplate, type SystemSpell, type SystemSkill, type SystemTrait, type Character, type TokenEffect, type SpellEffect, type ItemEffect, type CharacterTemplateFolder, type V3Spell } from '@/lib/api';
import {
  V3_ELEMENT_MAP,
  V3_ROLE_MAP,
  V3_CORE_ROLE_KEY,
  V3_INTENT_MAP,
  V3_DELIVERY_MAP,
  V3_REACH_MAP,
  V3_DURATION_MAP,
  V3_ELEMENTS,
  V3_SECONDARY_ROLES,
  V3_INTENTS,
  V3_DELIVERIES,
  V3_REACHES,
  V3_DURATIONS,
  v3RoleColor,
  v3ManaCost,
  v3CraftDc,
  isValidV3Composition,
  type V3SpellComposition,
} from '@shared/v3spells';
import { V3_SKILLS } from '@shared/v3';
import { getEffectTypes, getEffectTypeLabel } from '@/lib/effectTypes';
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
import { SpeciesDialog } from '@arcana/library-dialogs';
import { V3SystemSpeciesDialog } from '@/components/admin/V3SystemSpeciesDialog';
import { useLibraryDialogsHost } from '@/lib/libraryDialogsHost';
import type { SpeciesDraft } from '@arcana/library-dialogs';
import { apiRequest } from '@/lib/queryClient';
import { ArrowLeft, Plus, Pencil, Trash2, Sword, Shield, Package, Sparkles, Box, CheckSquare, Coins, Search, Users, User, GitBranch, Library, Link, X, GripVertical, Star, Square, Zap, Heart, ShieldCheck, BookOpen, RefreshCw, ZoomIn, ZoomOut, Wand2, Save, Flame, Upload, Image as ImageIcon, Folder, FolderPlus, ChevronDown, ChevronRight, Layers, Copy, Bell, Send, Archive, RotateCcw, Hammer, Lock } from 'lucide-react';
import { ImageBrowser } from '@/components/ImageBrowser';
import { CharacterSheet } from '@/components/game/GameComponents';
import { RollEntriesEditor } from '@/components/game/RollEntriesEditor';
import { CraftRecipesEditor } from '@/components/game/CraftRecipesEditor';
import { ItemDialog, arcanaSessionHostAdapter } from '@arcana/library-dialogs';
import '@arcana/library-dialogs/theme.css';
import {
  arcanaApiTransport,
  ArcanaModalChrome,
  useImageBrowserBridge,
  itemToDraft,
} from '@/lib/library-dialog-bridges';
import { SpellbookLibraryManager } from '@/components/library/SpellbookLibraryManager';

type AdminView = 'dashboard' | 'items' | 'item-templates' | 'crafter-recipe-templates' | 'species' | 'spells' | 'skills' | 'traits' | 'feat-trees' | 'classes' | 'characters' | 'token-effects' | 'notifications' | 'archived-items' | 'archived-spells' | 'v3-spells' | 'element-requirements' | 'techniques' | 'technique-groups';

// Lazy-loading item image component for admin list view
function LazyAdminItemImage({ itemId, itemType }: { itemId: string; itemType: string }) {
  const [isVisible, setIsVisible] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Fetch image only when visible
  const { data: imageData } = useQuery({
    queryKey: ['item-image', itemId],
    queryFn: () => api.getItemImage(itemId),
    enabled: isVisible,
    staleTime: 30 * 60 * 1000, // Cache for 30 minutes
  });

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const Icon = itemTypeIcons[itemType] || Package;

  return (
    <div ref={imgRef} className="h-10 w-10 sm:h-12 sm:w-12 rounded bg-stone-700 flex items-center justify-center shrink-0 overflow-hidden">
      {imageData?.image ? (
        <img src={imageData.image} alt="" className="h-full w-full object-cover" />
      ) : (
        <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-stone-400" />
      )}
    </div>
  );
}

function LazyAdminSpellIcon({ spellId, size = 'md' }: { spellId: string; size?: 'sm' | 'md' }) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['spell-icon', spellId],
    queryFn: () => api.getSystemSpellIcon(spellId),
    enabled: isVisible,
    staleTime: 30 * 60 * 1000,
  });

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const dim = size === 'sm' ? 'w-8 h-8' : 'h-10 w-10 sm:h-12 sm:w-12';
  const iconDim = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5 sm:h-6 sm:w-6';

  return (
    <div ref={ref} className={`${dim} rounded bg-stone-700 flex items-center justify-center shrink-0 overflow-hidden`}>
      {data?.icon ? (
        <img src={data.icon} alt="" className="h-full w-full object-cover" />
      ) : (
        <Sparkles className={`${iconDim} text-blue-400`} />
      )}
    </div>
  );
}

const itemTypeIcons: Record<string, any> = {
  weapon: Sword,
  armor: Shield,
  consumable: Package,
  utility: Sparkles,
  container: Box,
  currency: Coins,
  spellbook: BookOpen,
};

const rarityColors: Record<string, string> = {
  common: 'bg-stone-600',
  uncommon: 'bg-green-600',
  rare: 'bg-blue-600',
  epic: 'bg-purple-600',
  legendary: 'bg-amber-600',
};

const sizeOptions = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];

function toSpeciesDraft(s: SystemSpecies): SpeciesDraft {
  const extra = s as unknown as {
    energyPerLevel?: number;
    startingMana?: number;
    startingMaxMana?: number;
    manaPerLevel?: number;
    visionType?: string;
    dayVisionDistance?: number;
    nightVisionDistance?: number;
    ownerUserId?: string | null;
  };
  return {
    id: s.id,
    systemName: s.systemName,
    name: s.name,
    description: s.description ?? "",
    defaultImage: s.defaultImage ?? "",
    lifespan: s.lifespan,
    speed: s.speed,
    flySpeed: s.flySpeed,
    size: s.size,
    naturalArmor: s.naturalArmor,
    sizeBonus: s.sizeBonus,
    startingHp: s.startingHp,
    startingMaxHp: s.startingMaxHp,
    hpPerLevel: s.hpPerLevel,
    startingEnergy: s.startingEnergy,
    startingMaxEnergy: s.startingMaxEnergy,
    energyPerLevel: extra.energyPerLevel ?? 6,
    startingMana: extra.startingMana ?? 0,
    startingMaxMana: extra.startingMaxMana ?? 0,
    manaPerLevel: extra.manaPerLevel ?? 0,
    carryWeight: s.carryWeight,
    featTree: s.featTree ?? "",
    visionType: extra.visionType ?? "normal",
    dayVisionDistance: extra.dayVisionDistance ?? 60,
    nightVisionDistance: extra.nightVisionDistance ?? 30,
    ownerUserId: extra.ownerUserId ?? null,
  };
}

interface AdminSettingsProps {
  // When true, render as an embedded floating panel (no full-screen chrome /
  // "back to home" navigation) instead of the standalone /admin page.
  embedded?: boolean;
  // Force personal-library scope regardless of admin status or URL params.
  forcePersonal?: boolean;
  // Initial system display label ('Arcana Adventure' | 'A.A. V2' | 'A.A. V3')
  // used to seed the system switcher when embedded in a campaign.
  embeddedSystem?: string;
}

export default function AdminSettings({ embedded = false, forcePersonal = false, embeddedSystem }: AdminSettingsProps = {}) {
  const [, setLocation] = useLocation();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const search = useSearch();
  // "My Library" personal mode: scopes every list/create to the current user
  // (own + global rows only), even for admins. Non-admins are always personal.
  const personalMode = forcePersonal || new URLSearchParams(search).get('personal') === '1' || !isAdmin;
  
  const [currentView, setCurrentView] = useState<AdminView>('dashboard');
  const [selectedSystem, setSelectedSystem] = useState(() => {
    if (embedded && embeddedSystem) return embeddedSystem;
    if (!isAdmin) return 'A.A. V2';
    return localStorage.getItem('admin-selected-system') || 'Arcana Adventure';
  });
  const systemSlug = selectedSystem === 'A.A. V2' ? 'aa-v2' : selectedSystem === 'A.A. V3' ? 'aa-v3' : 'arcana-adventure';
  const isPersonalLibSystem = systemSlug === 'aa-v2' || systemSlug === 'aa-v3';
  const { host: libraryDialogsHost, imageBrowserNode: libraryDialogsImageBrowser } = useLibraryDialogsHost(systemSlug, selectedSystem, personalMode);

  // Non-admin GMs are scoped to their AA V2 private library
  const nonAdminAllowedViews: AdminView[] = ['dashboard', 'items', 'item-templates', 'crafter-recipe-templates', 'species', 'spells', 'feat-trees', 'classes', 'characters'];
  useEffect(() => {
    if (!embedded && !isAdmin && selectedSystem !== 'A.A. V2' && selectedSystem !== 'A.A. V3') setSelectedSystem('A.A. V2');
  }, [isAdmin, selectedSystem, embedded]);
  useEffect(() => {
    if (!isAdmin && !nonAdminAllowedViews.includes(currentView)) setCurrentView('dashboard');
  }, [isAdmin, currentView]);
  
  const [showAddItem, setShowAddItem] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  // @arcana/library-dialogs host adapter — wraps existing api.* calls behind a
  // session-cookie LibraryTransport, bridges Arcana's <ImageBrowser> as the
  // image picker, and uses Radix Dialog chrome for the modal slot.
  const { imagePicker, element: imageBrowserElement } = useImageBrowserBridge();
  const itemDialogTransport = useMemo(() => arcanaApiTransport(systemSlug, personalMode), [systemSlug, personalMode]);
  const itemDialogHost = useMemo(
    () =>
      arcanaSessionHostAdapter({
        transport: itemDialogTransport,
        notify: (level, message) =>
          toast({
            title: level === 'error' ? 'Error' : level === 'warning' ? 'Warning' : 'Notice',
            description: message,
            variant: level === 'error' ? 'destructive' : 'default',
          }),
        imagePicker,
        modal: ArcanaModalChrome,
        spellbookManager: SpellbookLibraryManager,
        techniqueGroups: () => api.getV3TechniqueGroups().then((gs) => gs.map((g) => ({ id: g.id, name: g.name }))),
      }),
    [itemDialogTransport, imagePicker],
  );
  const createItemMutation = useMutation({
    mutationFn: async ({ item, draftRolls, templateLinks }: { item: Partial<Item>; draftRolls?: any[]; templateLinks?: string[] }) => {
      const created = await api.createSystemItem({ ...item, system: systemSlug, ...(personalMode ? { personal: true } : {}) } as any);
      if (draftRolls && draftRolls.length > 0) {
        for (const roll of draftRolls) {
          const { id, ...rollData } = roll;
          await api.createRollEntry({
            ...rollData,
            ownerType: 'item',
            ownerId: created.id,
          });
        }
      }
      if (templateLinks && templateLinks.length > 0) {
        await api.setItemTemplateLinks(created.id, templateLinks);
      }
      return created;
    },
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
    mutationFn: async ({ id, data, templateLinks }: { id: string; data: Partial<Item>; templateLinks?: string[] }) => {
      const updated = await api.updateSystemItem(id, data);
      if (templateLinks !== undefined) {
        await api.setItemTemplateLinks(id, templateLinks);
      }
      return updated;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['system-items'] });
      queryClient.invalidateQueries({ queryKey: ['admin-archived-items'] });
      queryClient.invalidateQueries({ queryKey: ['item-template-links', vars.id] });
      queryClient.invalidateQueries({ queryKey: ['roll-entries', 'item', vars.id] });
      setEditingItem(null);
      toast({ title: 'Item Updated', description: 'System item updated successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const invalidateItemQueries = (id?: string) => {
    queryClient.invalidateQueries({ queryKey: ['system-items'] });
    queryClient.invalidateQueries({ queryKey: ['system-items-summary'] });
    queryClient.invalidateQueries({ queryKey: ['admin-archived-items'] });
    if (id) {
      queryClient.invalidateQueries({ queryKey: ['item-template-links', id] });
      queryClient.invalidateQueries({ queryKey: ['roll-entries', 'item', id] });
    }
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Item | null>(null);
  const [templateSearchQuery, setTemplateSearchQuery] = useState('');

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
  const [expandedTemplateFolders, setExpandedTemplateFolders] = useState<Set<string>>(new Set());
  const [newTemplateFolderName, setNewTemplateFolderName] = useState('');
  const [editingTemplateFolderId, setEditingTemplateFolderId] = useState<string | null>(null);
  const [editingTemplateFolderName, setEditingTemplateFolderName] = useState('');
  const [draggingTemplateId, setDraggingTemplateId] = useState<string | null>(null);

  const [showAddTokenEffect, setShowAddTokenEffect] = useState(false);
  const [editingTokenEffect, setEditingTokenEffect] = useState<TokenEffect | null>(null);
  const [tokenEffectSearchQuery, setTokenEffectSearchQuery] = useState('');

  // Use lightweight summary endpoint for fast list loading (no images)
  const { data: systemItemSummaries = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['system-items-summary', systemSlug, personalMode],
    queryFn: () => api.getSystemItemSummaries(systemSlug, undefined, personalMode),
    enabled: currentView === 'items',
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const { data: systemSpecies = [], isLoading: speciesLoading } = useQuery({
    queryKey: ['system-species', selectedSystem, personalMode],
    queryFn: () => api.getSystemSpecies(selectedSystem, undefined, personalMode),
    enabled: currentView === 'species',
  });

  const { data: systemSpells = [], isLoading: spellsLoading } = useQuery({
    queryKey: ['system-spells-summary', systemSlug, personalMode],
    queryFn: () => api.getSystemSpellSummaries(systemSlug, undefined, personalMode),
    enabled: currentView === 'spells',
  });

  const { data: systemSkills = [], isLoading: skillsLoading } = useQuery({
    queryKey: ['system-skills', systemSlug],
    queryFn: () => api.getSystemSkills(systemSlug),
    enabled: isAdmin && currentView === 'skills',
  });

  const { data: systemTraits = [], isLoading: traitsLoading } = useQuery({
    queryKey: ['system-traits', systemSlug],
    queryFn: () => api.getSystemTraits(systemSlug),
    enabled: isAdmin && currentView === 'traits',
  });

  const { data: characterTemplates = [], isLoading: charactersLoading } = useQuery({
    queryKey: ['character-templates', personalMode],
    queryFn: () => api.getCharacterTemplates(personalMode),
    enabled: currentView === 'characters',
  });

  const { data: templateFolders = [], isLoading: templateFoldersLoading } = useQuery({
    queryKey: ['character-template-folders'],
    queryFn: () => api.getCharacterTemplateFolders(),
    enabled: currentView === 'characters',
  });

  const { data: tokenEffects = [], isLoading: tokenEffectsLoading } = useQuery({
    queryKey: ['token-effects'],
    queryFn: () => api.getTokenEffects(),
    enabled: isAdmin && currentView === 'token-effects',
  });

  const { data: allFeatTrees = [] } = useQuery({
    queryKey: ['feat-trees', systemSlug, personalMode],
    queryFn: () => api.getFeatTrees(systemSlug, undefined, personalMode),
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

  // ===== Item Templates =====
  const { data: itemTemplates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['item-templates', systemSlug, personalMode],
    queryFn: () => api.getItemTemplates(systemSlug, personalMode),
    enabled: currentView === 'item-templates',
    staleTime: 5 * 60 * 1000,
  });

  const createItemTemplateMutation = useMutation({
    mutationFn: async ({ item, draftRolls }: { item: Partial<Item>; draftRolls?: any[] }) => {
      const created = await api.createItemTemplate({ ...item, system: systemSlug, ...(personalMode ? { personal: true } : {}) } as any);
      if (draftRolls && draftRolls.length > 0) {
        for (const roll of draftRolls) {
          const { id, ...rollData } = roll;
          await api.createRollEntry({
            ...rollData,
            ownerType: 'item',
            ownerId: created.id,
          });
        }
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-templates'] });
      setShowAddTemplate(false);
      toast({ title: 'Template Created', description: 'Item template created successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateItemTemplateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Item> }) => api.updateItemTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-templates'] });
      setEditingTemplate(null);
      toast({ title: 'Template Updated', description: 'Linked items will be updated automatically' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteItemTemplateMutation = useMutation({
    mutationFn: (id: string) => api.deleteItemTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-templates'] });
      toast({ title: 'Template Deleted', description: 'Linked items have been unlinked' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Bulk-delete roll templates by calling the per-template DELETE endpoint
  // for each id. Each call goes through the proper template cleanup
  // pathway (scrubbing inherited rolls and dropping link rows across both
  // items and spells), unlike the generic bulkDeleteItems endpoint.
  const bulkDeleteItemTemplatesMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map(id => api.deleteItemTemplate(id)));
      const failed = results.filter(r => r.status === 'rejected').length;
      return { total: ids.length, failed };
    },
    onSuccess: ({ total, failed }) => {
      queryClient.invalidateQueries({ queryKey: ['item-templates'] });
      if (failed === 0) {
        toast({ title: `${total} templates deleted`, description: 'Linked items and spells have been unlinked' });
      } else {
        toast({ title: `${total - failed} of ${total} templates deleted`, description: `${failed} failed to delete`, variant: 'destructive' });
      }
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const duplicateItemTemplateMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      // Pull the source template's full record + its rolls, then create a
      // brand-new template with the same fields and copy each roll onto it.
      // The copy is a standalone template — its rolls have no provenance
      // pointer, so future edits to the original do NOT affect the copy.
      const source = await api.getItemTemplate(sourceId);
      const sourceRolls = await api.getItemRolls(sourceId);
      const {
        id: _id,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        templateItemId: _templateItemId,
        ...rest
      } = source as any;
      const copy = await api.createItemTemplate({
        ...rest,
        name: `${source.name} (Copy)`,
        system: systemSlug,
        isLiveTemplate: true,
        ...(personalMode ? { personal: true } : {}),
      } as any);
      // The server auto-creates rolls for some item flags (e.g. a "Detonate"
      // roll when isDetonatable is true). Skip any source roll whose name
      // already exists on the copy to avoid duplicates.
      const autoRolls = await api.getItemRolls(copy.id);
      const existingNames = new Set(autoRolls.map((r: any) => r.name));
      for (const roll of sourceRolls) {
        const {
          id: _rollId,
          createdAt: _rollCreated,
          updatedAt: _rollUpdated,
          ownerId: _ownerId,
          fromTemplateRollId: _fromTemplate,
          ...rollData
        } = roll as any;
        if (existingNames.has(rollData.name)) continue;
        await api.createRollEntry({
          ...rollData,
          ownerType: 'item',
          ownerId: copy.id,
        });
      }
      return copy;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-templates'] });
      toast({ title: 'Template Duplicated', description: 'A copy has been created' });
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
    mutationFn: async ({ spell, draftRolls, templateLinks }: { spell: Partial<SystemSpell>; draftRolls?: any[]; templateLinks?: string[] }) => {
      const created = await api.createSystemSpell({ ...spell, system: systemSlug, ...(personalMode ? { personal: true } : {}) } as any);
      if (draftRolls && draftRolls.length > 0) {
        for (const roll of draftRolls) {
          const { id, ...rollData } = roll;
          await api.createRollEntry({
            ...rollData,
            ownerType: 'spell',
            ownerId: created.id,
          });
        }
      }
      if (templateLinks && templateLinks.length > 0) {
        await api.setSpellTemplateLinks(created.id, templateLinks);
      }
      return created;
    },
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
    mutationFn: async ({ id, data, templateLinks }: { id: string; data: Partial<SystemSpell>; templateLinks?: string[] }) => {
      const updated = await api.updateSystemSpell(id, data);
      if (templateLinks !== undefined) {
        await api.setSpellTemplateLinks(id, templateLinks);
      }
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-spells'] });
      queryClient.invalidateQueries({ queryKey: ['admin-archived-spells'] });
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
    mutationFn: (skill: Partial<SystemSkill>) => api.createSystemSkill({ ...skill, system: systemSlug }),
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
    mutationFn: (trait: Partial<SystemTrait>) => api.createSystemTrait({ ...trait, system: systemSlug }),
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

  const copyItemToSystemMutation = useMutation({
    mutationFn: ({ id, targetSystem }: { id: string; targetSystem: string }) => api.copyItemToSystem(id, targetSystem),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-items'] });
      queryClient.invalidateQueries({ queryKey: ['system-items-summary'] });
      toast({ title: 'Item Copied', description: `Item copied to ${systemSlug === 'aa-v2' ? 'Arcana Adventure' : systemSlug === 'aa-v3' ? 'A.A. V2' : 'A.A. V2'}` });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const copySpellToSystemMutation = useMutation({
    mutationFn: ({ id, targetSystem }: { id: string; targetSystem: string }) => api.copySpellToSystem(id, targetSystem),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-spells'] });
      toast({ title: 'Spell Copied', description: `Spell copied to ${systemSlug === 'aa-v2' ? 'Arcana Adventure' : systemSlug === 'aa-v3' ? 'A.A. V2' : 'A.A. V2'}` });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const duplicateItemMutation = useMutation({
    mutationFn: (id: string) => api.duplicateSystemItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-items'] });
      queryClient.invalidateQueries({ queryKey: ['system-items-summary'] });
      toast({ title: 'Item Duplicated', description: 'Item and all its rolls have been duplicated.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const duplicateSpellMutation = useMutation({
    mutationFn: (id: string) => api.duplicateSystemSpell(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-spells'] });
      toast({ title: 'Spell Duplicated', description: 'Spell and all its rolls have been duplicated.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const createCharacterMutation = useMutation({
    mutationFn: (character: Partial<Character>) => api.createCharacterTemplate({ ...character, ...(personalMode ? { personal: true } : {}) } as any),
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

  const createTemplateFolderMutation = useMutation({
    mutationFn: (name: string) => api.createCharacterTemplateFolder({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['character-template-folders'] });
      setNewTemplateFolderName('');
      toast({ title: 'Folder Created', description: 'Template folder created successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateTemplateFolderMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.updateCharacterTemplateFolder(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['character-template-folders'] });
      setEditingTemplateFolderId(null);
      toast({ title: 'Folder Updated', description: 'Template folder updated successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteTemplateFolderMutation = useMutation({
    mutationFn: (id: string) => api.deleteCharacterTemplateFolder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['character-template-folders'] });
      queryClient.invalidateQueries({ queryKey: ['character-templates'] });
      toast({ title: 'Folder Deleted', description: 'Template folder deleted. Templates moved to Unfiled.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const moveTemplateToFolderMutation = useMutation({
    mutationFn: ({ templateId, folderId }: { templateId: string; folderId: string | null }) => 
      api.updateCharacterTemplate(templateId, { folderId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['character-templates'] });
      toast({ title: 'Template Moved', description: 'Template moved successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const toggleTemplateFolder = (folderId: string) => {
    setExpandedTemplateFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  };

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

  const archiveItemMutation = useMutation({
    mutationFn: (id: string) => api.archiveSystemItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-items-summary'] });
      queryClient.invalidateQueries({ queryKey: ['system-items'] });
      toast({ title: 'Item Archived' });
    },
  });

  const archiveAllItemsMutation = useMutation({
    mutationFn: () => api.archiveAllSystemItems(systemSlug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-items-summary'] });
      queryClient.invalidateQueries({ queryKey: ['system-items'] });
      toast({ title: 'All Items Archived' });
    },
  });

  const archiveSpellMutation = useMutation({
    mutationFn: (id: string) => api.archiveSystemSpell(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-spells'] });
      toast({ title: 'Spell Archived' });
    },
  });

  const archiveAllSpellsMutation = useMutation({
    mutationFn: () => api.archiveAllSystemSpells(systemSlug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-spells'] });
      toast({ title: 'All Spells Archived' });
    },
  });


  const debouncedSearchQuery = useDebouncedValue(searchQuery, 150);
  const debouncedSpeciesSearchQuery = useDebouncedValue(speciesSearchQuery, 150);
  const debouncedSpellSearchQuery = useDebouncedValue(spellSearchQuery, 150);
  const debouncedSkillSearchQuery = useDebouncedValue(skillSearchQuery, 150);
  const debouncedTraitSearchQuery = useDebouncedValue(traitSearchQuery, 150);
  const debouncedCharacterSearchQuery = useDebouncedValue(characterSearchQuery, 150);
  const debouncedTokenEffectSearchQuery = useDebouncedValue(tokenEffectSearchQuery, 150);
  
  const filteredItems = useMemo(() => {
    return systemItemSummaries.filter((item: any) => {
      const matchesSearch = item.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase());
      const matchesType = typeFilter === 'all' || item.itemType === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [systemItemSummaries, debouncedSearchQuery, typeFilter]);

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
    <div className={`${embedded ? 'h-full' : 'h-screen'} bg-stone-950 text-stone-200 flex flex-col overflow-auto`}>
      <div className={`w-full ${embedded ? 'px-3 py-3' : 'px-4 py-4'} flex flex-col flex-1 min-h-0`}>
        <div className="flex items-center gap-4 mb-4 shrink-0">
          {(!embedded || currentView !== 'dashboard') && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBackNavigation}
              className="text-stone-400 hover:text-stone-200"
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div className="flex-1">
            {!embedded && (
              <h1 className="text-2xl font-bold text-amber-500">{(isAdmin && !personalMode) ? 'Admin Settings' : 'My Library'}</h1>
            )}
            <p className="text-stone-400 text-sm">
              {currentView === 'dashboard' ? 'Manage game system settings' : 
               currentView === 'items' ? 'System Items' :
               currentView === 'item-templates' ? 'Roll Templates' :
               currentView === 'crafter-recipe-templates' ? 'Crafter Recipe Templates' :
               currentView === 'species' ? 'Species / Races' : 
               currentView === 'spells' ? 'Spells' : 
               currentView === 'skills' ? (systemSlug === 'aa-v3' ? 'Knowledge' : 'Custom Skills') : 
               currentView === 'traits' ? 'Traits' : 
               currentView === 'characters' ? 'Character Templates' : 
               currentView === 'token-effects' ? 'Token Effects' : 
               currentView === 'notifications' ? 'Push Notifications' :
               currentView === 'archived-items' ? 'Archived Items' :
               currentView === 'archived-spells' ? 'Archived Spells' : 
               currentView === 'v3-spells' ? 'Crafted Spells (A.A. V3)' : 
               currentView === 'element-requirements' ? 'Element Requirements (A.A. V3)' : 
               currentView === 'techniques' ? 'Techniques (A.A. V3)' : 
               currentView === 'technique-groups' ? 'Weapon Techniques (A.A. V3)' : 
               currentView === 'classes' ? 'Classes (A.A. V2)' : 
               (currentView === 'feat-trees' && isPersonalLibSystem) ? 'Skill Trees' : 'Feat Trees'}
            </p>
          </div>
          {(isAdmin || embedded) && (
            <div className={embedded ? 'w-[150px]' : 'w-[200px]'}>
              <Select value={selectedSystem} onValueChange={(val) => { setSelectedSystem(val); if (!embedded) localStorage.setItem('admin-selected-system', val); }}>
                <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-system">
                  <SelectValue placeholder="Select System" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Arcana Adventure">Arcana Adventure</SelectItem>
                  <SelectItem value="A.A. V2">A.A. V2</SelectItem>
                  <SelectItem value="A.A. V3">A.A. V3</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {currentView === 'dashboard' && (
          <DashboardView onNavigate={setCurrentView} systemSlug={systemSlug} isAdmin={isAdmin} />
        )}

        {currentView === 'v3-spells' && (
          <V3SpellsApprovalView />
        )}

        {currentView === 'element-requirements' && (
          <V3ElementRequirementsView systemSlug={systemSlug} />
        )}

        {currentView === 'techniques' && (
          <V3TechniquesView systemSlug={systemSlug} />
        )}

        {currentView === 'technique-groups' && (
          <V3TechniqueGroupsView systemSlug={systemSlug} />
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
            onEditItem={async (itemId) => {
              // Fetch full item data for editing
              const fullItem = await api.getSystemItem(itemId);
              setEditingItem(fullItem);
            }}
            onDeleteItem={(id) => {
              if (confirm('Are you sure you want to delete this item?')) {
                deleteItemMutation.mutate(id);
              }
            }}
            onDuplicateItem={async (itemId) => {
              duplicateItemMutation.mutate(itemId);
            }}
            onArchiveItem={(id) => {
              if (confirm('Archive this item? It will be removed from campaign item lists but remain on character sheets.')) {
                archiveItemMutation.mutate(id);
              }
            }}
            onCopyToSystem={(id) => {
              const target = systemSlug === 'aa-v2' ? 'arcana-adventure' : 'aa-v2';
              copyItemToSystemMutation.mutate({ id, targetSystem: target });
            }}
            copyTargetLabel={systemSlug === 'aa-v2' ? 'Arcana Adventure' : systemSlug === 'aa-v3' ? '' : 'A.A. V2'}
          />
        )}

        {currentView === 'crafter-recipe-templates' && (
          <CrafterRecipeTemplatesView systemSlug={systemSlug} personal={personalMode} />
        )}

        {currentView === 'item-templates' && (
          <ItemTemplatesView
            templates={itemTemplates}
            isLoading={templatesLoading}
            searchQuery={templateSearchQuery}
            setSearchQuery={setTemplateSearchQuery}
            onAddTemplate={() => setShowAddTemplate(true)}
            onEditTemplate={async (id) => {
              const full = await api.getItemTemplate(id);
              setEditingTemplate(full);
            }}
            onDeleteTemplate={(id) => {
              if (confirm('Delete this template? Linked items will be unlinked but preserved.')) {
                deleteItemTemplateMutation.mutate(id);
              }
            }}
            onDuplicateTemplate={(id) => duplicateItemTemplateMutation.mutate(id)}
            onBulkDeleteTemplates={(ids) => bulkDeleteItemTemplatesMutation.mutate(ids)}
            bulkDeletePending={bulkDeleteItemTemplatesMutation.isPending}
            duplicatingTemplateId={duplicateItemTemplateMutation.isPending ? (duplicateItemTemplateMutation.variables as string) : null}
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
            onDuplicateSpell={(id) => {
              duplicateSpellMutation.mutate(id);
            }}
            onArchiveSpell={(id) => {
              if (confirm('Archive this spell? It will be removed from campaign spell lists but remain on character sheets.')) {
                archiveSpellMutation.mutate(id);
              }
            }}
            onCopyToSystem={(id) => {
              const target = systemSlug === 'aa-v2' ? 'arcana-adventure' : 'aa-v2';
              copySpellToSystemMutation.mutate({ id, targetSystem: target });
            }}
            copyTargetLabel={systemSlug === 'aa-v2' ? 'Arcana Adventure' : systemSlug === 'aa-v3' ? '' : 'A.A. V2'}
          />
        )}

        {currentView === 'skills' && (
          <SkillsView
            skills={filteredSkills}
            systemSlug={systemSlug}
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
            isLoading={charactersLoading || templateFoldersLoading}
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
            folders={templateFolders}
            expandedFolders={expandedTemplateFolders}
            toggleFolder={toggleTemplateFolder}
            newFolderName={newTemplateFolderName}
            setNewFolderName={setNewTemplateFolderName}
            onCreateFolder={(name) => createTemplateFolderMutation.mutate(name)}
            isCreatingFolder={createTemplateFolderMutation.isPending}
            editingFolderId={editingTemplateFolderId}
            setEditingFolderId={setEditingTemplateFolderId}
            editingFolderName={editingTemplateFolderName}
            setEditingFolderName={setEditingTemplateFolderName}
            onUpdateFolder={(id, name) => updateTemplateFolderMutation.mutate({ id, name })}
            onDeleteFolder={(id) => {
              if (confirm('Delete this folder? Templates inside will be moved to Unfiled.')) {
                deleteTemplateFolderMutation.mutate(id);
              }
            }}
            draggingTemplateId={draggingTemplateId}
            setDraggingTemplateId={setDraggingTemplateId}
            onMoveTemplateToFolder={(templateId, folderId) => moveTemplateToFolderMutation.mutate({ templateId, folderId })}
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
          <FeatTreesView systemSlug={systemSlug} personal={personalMode} />
        )}

        {currentView === 'classes' && (
          <ClassesView systemSlug={systemSlug} personal={personalMode} />
        )}

        {currentView === 'notifications' && (
          <NotificationsView />
        )}

        {currentView === 'archived-items' && (
          <ArchivedItemsView 
            onNavigateBack={() => setCurrentView('items')} 
            onEditItem={async (itemId) => {
              const fullItem = await api.getSystemItem(itemId);
              setEditingItem(fullItem);
            }}
            systemSlug={systemSlug}
          />
        )}

        {currentView === 'archived-spells' && (
          <ArchivedSpellsView 
            onNavigateBack={() => setCurrentView('spells')} 
            onEditSpell={setEditingSpell}
            systemSlug={systemSlug}
          />
        )}

        {/* AA V2 uses the new @arcana/library-dialogs ItemDialog (multi-template
            links via ItemTemplateLinksPanel). Legacy systems keep the inline
            ItemFormDialog so the single-link picker (ItemTemplateLinkPicker)
            and its attendant flow stay intact and we never blindly write back
            an empty templateLinks array on legacy edits. */}
        {isPersonalLibSystem ? (
          <>
            <ItemDialog
              open={showAddItem}
              onOpenChange={(open) => setShowAddItem(open)}
              mode="create"
              host={itemDialogHost}
              campaignSystem={systemSlug}
              onSaved={(saved) => {
                invalidateItemQueries(saved.id);
                setShowAddItem(false);
                toast({ title: 'Item Created', description: 'System item created successfully' });
              }}
            />

            {editingItem && (
              <ItemDialog
                open={!!editingItem}
                onOpenChange={(open) => { if (!open) setEditingItem(null); }}
                mode="edit"
                initialValue={itemToDraft(editingItem)}
                host={itemDialogHost}
                campaignSystem={systemSlug}
                onSaved={(saved) => {
                  invalidateItemQueries(saved.id);
                  setEditingItem(null);
                  toast({ title: 'Item Updated', description: 'System item updated successfully' });
                }}
              />
            )}
          </>
        ) : (
          <>
            <ItemFormDialog
              open={showAddItem}
              onOpenChange={(open) => setShowAddItem(open)}
              onSave={(data, draftRolls, templateLinks) =>
                createItemMutation.mutate({ item: data, draftRolls, templateLinks })
              }
              isLoading={createItemMutation.isPending}
              campaignSystem={systemSlug}
              personal={personalMode}
            />

            {editingItem && (
              <ItemFormDialog
                open={!!editingItem}
                onOpenChange={(open) => { if (!open) setEditingItem(null); }}
                onSave={(data, _draftRolls, templateLinks) =>
                  updateItemMutation.mutate({ id: editingItem.id, data, templateLinks })
                }
                initialData={editingItem}
                isLoading={updateItemMutation.isPending}
                campaignSystem={systemSlug}
                personal={personalMode}
              />
            )}
          </>
        )}

        {imageBrowserElement}

        <TemplateFormDialog
          open={showAddTemplate}
          onOpenChange={setShowAddTemplate}
          onSave={(data, draftRolls) => createItemTemplateMutation.mutate({ item: data, draftRolls })}
          isLoading={createItemTemplateMutation.isPending}
          campaignSystem={systemSlug}
        />

        {editingTemplate && (
          <TemplateFormDialog
            open={!!editingTemplate}
            onOpenChange={() => setEditingTemplate(null)}
            onSave={(data, _draftRolls) => updateItemTemplateMutation.mutate({ id: editingTemplate.id, data })}
            initialData={editingTemplate}
            isLoading={updateItemTemplateMutation.isPending}
            campaignSystem={systemSlug}
          />
        )}

        {systemSlug === 'aa-v3' ? (
          <V3SystemSpeciesDialog
            open={showAddSpecies}
            onOpenChange={setShowAddSpecies}
            systemName={selectedSystem}
            onSaved={() => setShowAddSpecies(false)}
          />
        ) : (
          <SpeciesDialog
            open={showAddSpecies}
            onOpenChange={setShowAddSpecies}
            mode="create"
            host={libraryDialogsHost}
            campaignSystem={systemSlug}
            onSaved={() => setShowAddSpecies(false)}
          />
        )}

        {editingSpecies && (
          systemSlug === 'aa-v3' ? (
            <V3SystemSpeciesDialog
              open={!!editingSpecies}
              onOpenChange={(open) => { if (!open) setEditingSpecies(null); }}
              systemName={selectedSystem}
              initialData={editingSpecies}
              onSaved={() => setEditingSpecies(null)}
            />
          ) : (
            <SpeciesDialog
              open={!!editingSpecies}
              onOpenChange={(open) => { if (!open) setEditingSpecies(null); }}
              mode="edit"
              initialValue={toSpeciesDraft(editingSpecies)}
              host={libraryDialogsHost}
              campaignSystem={systemSlug}
              onSaved={() => setEditingSpecies(null)}
            />
          )
        )}
        {libraryDialogsImageBrowser}

        <SpellFormDialog
          open={showAddSpell}
          onOpenChange={setShowAddSpell}
          onSave={(data, draftRolls, templateLinks) => createSpellMutation.mutate({ spell: data, draftRolls, templateLinks })}
          isLoading={createSpellMutation.isPending}
          campaignSystem={systemSlug}
          personal={personalMode}
        />

        {editingSpell && (
          <SpellFormDialog
            open={!!editingSpell}
            onOpenChange={() => setEditingSpell(null)}
            onSave={(data, _draftRolls, templateLinks) => updateSpellMutation.mutate({ id: editingSpell.id, data, templateLinks })}
            initialData={editingSpell}
            isLoading={updateSpellMutation.isPending}
            campaignSystem={systemSlug}
            personal={personalMode}
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
          systemSlug={systemSlug}
        />

        {editingTrait && (
          <TraitFormDialog
            open={!!editingTrait}
            onOpenChange={() => setEditingTrait(null)}
            onSave={(data) => updateTraitMutation.mutate({ id: editingTrait.id, data })}
            initialData={editingTrait}
            isLoading={updateTraitMutation.isPending}
            systemSlug={systemSlug}
          />
        )}

        <CharacterFormDialog
          open={showAddCharacter}
          onOpenChange={setShowAddCharacter}
          onSave={(data) => createCharacterMutation.mutate(data)}
          isLoading={createCharacterMutation.isPending}
          folders={templateFolders}
        />

        {editingCharacter && (
          <CharacterFormDialog
            open={!!editingCharacter}
            onOpenChange={() => setEditingCharacter(null)}
            onSave={(data) => updateCharacterMutation.mutate({ id: editingCharacter.id, data })}
            initialData={editingCharacter}
            isLoading={updateCharacterMutation.isPending}
            folders={templateFolders}
          />
        )}

        <TokenEffectFormDialog
          open={showAddTokenEffect}
          onOpenChange={setShowAddTokenEffect}
          onSave={(data) => createTokenEffectMutation.mutate(data)}
          isLoading={createTokenEffectMutation.isPending}
          systemSlug={systemSlug}
        />

        {editingTokenEffect && (
          <TokenEffectFormDialog
            open={!!editingTokenEffect}
            onOpenChange={() => setEditingTokenEffect(null)}
            onSave={(data) => updateTokenEffectMutation.mutate({ id: editingTokenEffect.id, data })}
            initialData={editingTokenEffect}
            isLoading={updateTokenEffectMutation.isPending}
            systemSlug={systemSlug}
          />
        )}

        {viewingCharacterSheet && (
          <div className="fixed inset-0 z-[10000] bg-stone-950/95 flex flex-col overflow-hidden">
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

function ArchivedItemsView({ onNavigateBack, onEditItem, systemSlug }: { onNavigateBack: () => void; onEditItem: (itemId: string) => void; systemSlug: string }) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { data: archivedItems = [], isLoading } = useQuery({
    queryKey: ['admin-archived-items', systemSlug],
    queryFn: () => api.getArchivedItems(systemSlug),
  });
  
  const restoreMutation = useMutation({
    mutationFn: (id: string) => api.restoreSystemItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-archived-items'] });
      queryClient.invalidateQueries({ queryKey: ['system-items-summary'] });
      queryClient.invalidateQueries({ queryKey: ['system-items'] });
      toast({ title: 'Item Restored', description: 'Item has been moved back to active items' });
    },
  });

  const bulkRestoreMutation = useMutation({
    mutationFn: (ids: string[]) => api.bulkRestoreItems(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-archived-items'] });
      queryClient.invalidateQueries({ queryKey: ['system-items-summary'] });
      queryClient.invalidateQueries({ queryKey: ['system-items'] });
      setSelectedIds(new Set());
      toast({ title: `${selectedIds.size} items restored` });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.bulkDeleteItems(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-archived-items'] });
      queryClient.invalidateQueries({ queryKey: ['system-items-summary'] });
      setSelectedIds(new Set());
      toast({ title: 'Items deleted' });
    },
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === archivedItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(archivedItems.map((i: any) => i.id)));
    }
  };

  const allSelected = archivedItems.length > 0 && selectedIds.size === archivedItems.length;
  const someSelected = selectedIds.size > 0;

  return (
    <Card className="bg-stone-900 border-stone-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-amber-500">Archived Items</CardTitle>
          <Button size="sm" variant="outline" onClick={onNavigateBack} className="border-stone-600 text-stone-300">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Items
          </Button>
        </div>
        <CardDescription className="text-stone-400">
          Archived items are not available for use in campaigns but can be referenced.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-stone-400 text-sm">Loading...</p>}
        {!isLoading && archivedItems.length === 0 && (
          <p className="text-stone-400 text-sm italic">No archived items</p>
        )}

        {archivedItems.length > 0 && (
          <div className="flex items-center gap-3 mb-3">
            <button onClick={toggleAll} className="flex items-center gap-2 text-xs text-stone-400 hover:text-stone-200 transition-colors" data-testid="button-select-all-archived-items">
              {allSelected ? <CheckSquare className="h-4 w-4 text-amber-400" /> : <Square className="h-4 w-4" />}
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
            {someSelected && <span className="text-xs text-amber-400">{selectedIds.size} selected</span>}
          </div>
        )}

        <div className="space-y-2">
          {archivedItems.map((item: any) => (
            <div key={item.id} className={`flex items-center justify-between p-2 bg-stone-800 rounded-lg border ${selectedIds.has(item.id) ? 'border-amber-500/50 bg-amber-900/10' : 'border-stone-700'} cursor-pointer hover:border-stone-600`} onClick={() => onEditItem(item.id)}>
              <div className="flex items-center gap-3">
                <button onClick={(e) => { e.stopPropagation(); toggleSelect(item.id); }} className="shrink-0" data-testid={`checkbox-archived-item-${item.id}`}>
                  {selectedIds.has(item.id) ? <CheckSquare className="h-5 w-5 text-amber-400" /> : <Square className="h-5 w-5 text-stone-500 hover:text-stone-300" />}
                </button>
                <div className="w-8 h-8 rounded bg-stone-700 flex items-center justify-center">
                  <Package className="h-4 w-4 text-stone-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-stone-200">{item.name}</p>
                  <p className="text-xs text-stone-400 capitalize">{item.itemType} · {item.rarity}</p>
                </div>
              </div>
              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="outline" className="border-stone-600 text-emerald-400 hover:text-emerald-300" onClick={() => restoreMutation.mutate(item.id)} disabled={restoreMutation.isPending} data-testid={`button-restore-item-${item.id}`}>
                  <RotateCcw className="h-3 w-3 mr-1" /> Restore
                </Button>
              </div>
            </div>
          ))}
        </div>

        {someSelected && (
          <div className="mt-3 flex items-center gap-2 p-3 bg-stone-800 border border-stone-600 rounded-lg">
            <span className="text-xs text-stone-300 mr-auto">{selectedIds.size} selected</span>
            <Button size="sm" variant="outline" className="h-7 text-xs border-emerald-800 text-emerald-400 hover:text-emerald-300" onClick={() => { if (confirm(`Restore ${selectedIds.size} items?`)) bulkRestoreMutation.mutate(Array.from(selectedIds)); }} disabled={bulkRestoreMutation.isPending} data-testid="button-bulk-restore-items">
              <RotateCcw className="h-3 w-3 mr-1" /> Restore
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs border-red-800 text-red-400 hover:text-red-300 hover:bg-red-900/30" onClick={() => { if (confirm(`Permanently delete ${selectedIds.size} items?`)) bulkDeleteMutation.mutate(Array.from(selectedIds)); }} disabled={bulkDeleteMutation.isPending} data-testid="button-bulk-delete-archived-items">
              <Trash2 className="h-3 w-3 mr-1" /> Delete
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-stone-500" onClick={() => setSelectedIds(new Set())} data-testid="button-clear-selection-archived-items">
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ArchivedSpellsView({ onNavigateBack, onEditSpell, systemSlug }: { onNavigateBack: () => void; onEditSpell: (spell: any) => void; systemSlug: string }) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { data: archivedSpells = [], isLoading } = useQuery({
    queryKey: ['admin-archived-spells', systemSlug],
    queryFn: () => api.getArchivedSpells(systemSlug),
  });
  
  const restoreMutation = useMutation({
    mutationFn: (id: string) => api.restoreSystemSpell(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-archived-spells'] });
      queryClient.invalidateQueries({ queryKey: ['system-spells'] });
      toast({ title: 'Spell Restored', description: 'Spell has been moved back to active spells' });
    },
  });

  const bulkRestoreMutation = useMutation({
    mutationFn: (ids: string[]) => api.bulkRestoreSpells(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-archived-spells'] });
      queryClient.invalidateQueries({ queryKey: ['system-spells'] });
      setSelectedIds(new Set());
      toast({ title: `${selectedIds.size} spells restored` });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.bulkDeleteSpells(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-archived-spells'] });
      setSelectedIds(new Set());
      toast({ title: 'Spells deleted' });
    },
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === archivedSpells.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(archivedSpells.map((s: any) => s.id)));
    }
  };

  const allSelected = archivedSpells.length > 0 && selectedIds.size === archivedSpells.length;
  const someSelected = selectedIds.size > 0;

  return (
    <Card className="bg-stone-900 border-stone-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-blue-500">Archived Spells</CardTitle>
          <Button size="sm" variant="outline" onClick={onNavigateBack} className="border-stone-600 text-stone-300">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Spells
          </Button>
        </div>
        <CardDescription className="text-stone-400">
          Archived spells are not available for use in campaigns but can be referenced.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-stone-400 text-sm">Loading...</p>}
        {!isLoading && archivedSpells.length === 0 && (
          <p className="text-stone-400 text-sm italic">No archived spells</p>
        )}

        {archivedSpells.length > 0 && (
          <div className="flex items-center gap-3 mb-3">
            <button onClick={toggleAll} className="flex items-center gap-2 text-xs text-stone-400 hover:text-stone-200 transition-colors" data-testid="button-select-all-archived-spells">
              {allSelected ? <CheckSquare className="h-4 w-4 text-blue-400" /> : <Square className="h-4 w-4" />}
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
            {someSelected && <span className="text-xs text-blue-400">{selectedIds.size} selected</span>}
          </div>
        )}

        <div className="space-y-2">
          {archivedSpells.map((spell: any) => (
            <div key={spell.id} className={`flex items-center justify-between p-2 bg-stone-800 rounded-lg border ${selectedIds.has(spell.id) ? 'border-blue-500/50 bg-blue-900/10' : 'border-stone-700'} cursor-pointer hover:border-stone-600`} onClick={() => onEditSpell(spell)}>
              <div className="flex items-center gap-3">
                <button onClick={(e) => { e.stopPropagation(); toggleSelect(spell.id); }} className="shrink-0" data-testid={`checkbox-archived-spell-${spell.id}`}>
                  {selectedIds.has(spell.id) ? <CheckSquare className="h-5 w-5 text-blue-400" /> : <Square className="h-5 w-5 text-stone-500 hover:text-stone-300" />}
                </button>
                {spell.icon ? (
                  <img src={spell.icon} alt={spell.name} className="w-8 h-8 rounded object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded bg-stone-700 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-stone-500" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-stone-200">{spell.name}</p>
                  <p className="text-xs text-stone-400 capitalize">{spell.school} · Level {spell.level}</p>
                </div>
              </div>
              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="outline" className="border-stone-600 text-emerald-400 hover:text-emerald-300" onClick={() => restoreMutation.mutate(spell.id)} disabled={restoreMutation.isPending} data-testid={`button-restore-spell-${spell.id}`}>
                  <RotateCcw className="h-3 w-3 mr-1" /> Restore
                </Button>
              </div>
            </div>
          ))}
        </div>

        {someSelected && (
          <div className="mt-3 flex items-center gap-2 p-3 bg-stone-800 border border-stone-600 rounded-lg">
            <span className="text-xs text-stone-300 mr-auto">{selectedIds.size} selected</span>
            <Button size="sm" variant="outline" className="h-7 text-xs border-emerald-800 text-emerald-400 hover:text-emerald-300" onClick={() => { if (confirm(`Restore ${selectedIds.size} spells?`)) bulkRestoreMutation.mutate(Array.from(selectedIds)); }} disabled={bulkRestoreMutation.isPending} data-testid="button-bulk-restore-spells">
              <RotateCcw className="h-3 w-3 mr-1" /> Restore
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs border-red-800 text-red-400 hover:text-red-300 hover:bg-red-900/30" onClick={() => { if (confirm(`Permanently delete ${selectedIds.size} spells?`)) bulkDeleteMutation.mutate(Array.from(selectedIds)); }} disabled={bulkDeleteMutation.isPending} data-testid="button-bulk-delete-archived-spells">
              <Trash2 className="h-3 w-3 mr-1" /> Delete
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-stone-500" onClick={() => setSelectedIds(new Set())} data-testid="button-clear-selection-archived-spells">
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const EMPTY_V3_COMPOSITION: V3SpellComposition = {
  core: '',
  secondaries: [],
  intent: '',
  delivery: '',
  reach: '',
  duration: '',
};

function V3CompositionBuilder({ value, onChange }: { value: V3SpellComposition; onChange: (c: V3SpellComposition) => void }) {
  const set = (patch: Partial<V3SpellComposition>) => onChange({ ...value, ...patch });
  const updateSecondary = (i: number, patch: Partial<{ element: string; role: string }>) =>
    set({ secondaries: value.secondaries.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  const addSecondary = () => set({ secondaries: [...value.secondaries, { element: '', role: '' }] });
  const removeSecondary = (i: number) => set({ secondaries: value.secondaries.filter((_, idx) => idx !== i) });

  const selectClass = 'h-8 text-xs bg-stone-800 border-stone-700';
  return (
    <div className="space-y-3" data-testid="v3-composition-builder">
      <div className="space-y-1">
        <Label className="text-xs text-stone-400">Core Element</Label>
        <Select value={value.core || undefined} onValueChange={(v) => set({ core: v })}>
          <SelectTrigger className={selectClass} data-testid="select-admin-core"><SelectValue placeholder="Choose core element" /></SelectTrigger>
          <SelectContent>
            {V3_ELEMENTS.map((el) => <SelectItem key={el.key} value={el.key} className="text-xs">{el.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-stone-400">Secondary Elements</Label>
          <Button type="button" size="sm" variant="outline" className="h-6 text-xs" onClick={addSecondary} data-testid="button-add-secondary">
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
        {value.secondaries.map((s, i) => (
          <div key={i} className="flex items-center gap-2" data-testid={`row-secondary-${i}`}>
            <Select value={s.element || undefined} onValueChange={(v) => updateSecondary(i, { element: v })}>
              <SelectTrigger className={selectClass}><SelectValue placeholder="Element" /></SelectTrigger>
              <SelectContent>
                {V3_ELEMENTS.map((el) => <SelectItem key={el.key} value={el.key} className="text-xs">{el.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={s.role || undefined} onValueChange={(v) => updateSecondary(i, { role: v })}>
              <SelectTrigger className={selectClass}><SelectValue placeholder="Role" /></SelectTrigger>
              <SelectContent>
                {V3_SECONDARY_ROLES.map((r) => <SelectItem key={r.key} value={r.key} className="text-xs">{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-red-400" onClick={() => removeSecondary(i)} data-testid={`button-remove-secondary-${i}`}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-stone-400">Intent</Label>
          <Select value={value.intent || undefined} onValueChange={(v) => set({ intent: v })}>
            <SelectTrigger className={selectClass} data-testid="select-admin-intent"><SelectValue placeholder="Choose" /></SelectTrigger>
            <SelectContent>{V3_INTENTS.map((o) => <SelectItem key={o.key} value={o.key} className="text-xs">{o.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-stone-400">Delivery</Label>
          <Select value={value.delivery || undefined} onValueChange={(v) => set({ delivery: v })}>
            <SelectTrigger className={selectClass} data-testid="select-admin-delivery"><SelectValue placeholder="Choose" /></SelectTrigger>
            <SelectContent>{V3_DELIVERIES.map((o) => <SelectItem key={o.key} value={o.key} className="text-xs">{o.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-stone-400">Reach</Label>
          <Select value={value.reach || undefined} onValueChange={(v) => set({ reach: v })}>
            <SelectTrigger className={selectClass} data-testid="select-admin-reach"><SelectValue placeholder="Choose" /></SelectTrigger>
            <SelectContent>{V3_REACHES.map((o) => <SelectItem key={o.key} value={o.key} className="text-xs">{o.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-stone-400">Duration</Label>
          <Select value={value.duration || undefined} onValueChange={(v) => set({ duration: v })}>
            <SelectTrigger className={selectClass} data-testid="select-admin-duration"><SelectValue placeholder="Choose" /></SelectTrigger>
            <SelectContent>{V3_DURATIONS.map((o) => <SelectItem key={o.key} value={o.key} className="text-xs">{o.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {isValidV3Composition(value) && (
        <p className="text-[11px] text-stone-500" data-testid="text-admin-composition-cost">
          {v3ManaCost(value)} mana · Craft DC {v3CraftDc(value)}
        </p>
      )}
    </div>
  );
}

type V3SpellFilter = 'official' | 'needs_approval' | 'all';

function V3SpellsApprovalView() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<V3Spell | null>(null);
  const [creating, setCreating] = useState(false);
  const [composition, setComposition] = useState<V3SpellComposition>(EMPTY_V3_COMPOSITION);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [showImageBrowser, setShowImageBrowser] = useState(false);
  const [filter, setFilter] = useState<V3SpellFilter>('official');
  // Set when approve/create finds another official spell with the same recipe.
  const [conflict, setConflict] = useState<{ existing: V3Spell; candidate: V3Spell; usage?: { campaignCount: number; characterCount: number } } | null>(null);
  const spellImageInputRef = useRef<HTMLInputElement>(null);

  const handleSpellImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => setImage(event.target?.result as string);
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const { data: spells = [], isLoading } = useQuery({
    queryKey: ['admin-v3-spells'],
    queryFn: () => api.getAdminV3Spells(),
  });

  const filteredSpells = spells.filter((s) => {
    if (filter === 'official') return s.isCanonical;
    if (filter === 'needs_approval') return s.status === 'awaiting_gm' || s.status === 'ready';
    return true;
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.approveV3Spell(id),
    onSuccess: (res) => {
      if (isV3SpellConflict(res)) {
        setConflict({ existing: res.existing, candidate: res.candidate, usage: res.usage });
        return;
      }
      toast({ title: 'Approved', description: 'This composition is now official.' });
      queryClient.invalidateQueries({ queryKey: ['admin-v3-spells'] });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const resolveMutation = useMutation({
    mutationFn: (vars: { id: string; resolution: 'keep_this' | 'keep_other' }) =>
      api.approveV3Spell(vars.id, vars.resolution),
    onSuccess: () => {
      toast({ title: 'Resolved', description: 'The official spell for this recipe was updated.' });
      queryClient.invalidateQueries({ queryKey: ['admin-v3-spells'] });
      setConflict(null);
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.rejectV3Spell(id),
    onSuccess: () => {
      toast({ title: 'Rejected' });
      queryClient.invalidateQueries({ queryKey: ['admin-v3-spells'] });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const editMutation = useMutation({
    mutationFn: (vars: { id: string; name: string; description: string; image: string | null }) =>
      api.updateAdminV3Spell(vars.id, { name: vars.name, description: vars.description, image: vars.image }),
    onSuccess: () => {
      toast({ title: 'Saved', description: 'Spell details updated.' });
      queryClient.invalidateQueries({ queryKey: ['admin-v3-spells'] });
      setEditing(null);
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const createMutation = useMutation({
    mutationFn: (vars: { composition: V3SpellComposition; name: string; description: string; image: string | null }) =>
      api.createAdminV3Spell(vars),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-v3-spells'] });
      setCreating(false);
      if (isV3SpellConflict(res)) {
        setConflict({ existing: res.existing, candidate: res.candidate, usage: res.usage });
        return;
      }
      toast({ title: 'Created', description: 'New recognized spell added.' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteAdminV3Spell(id),
    onSuccess: () => {
      toast({ title: 'Deleted' });
      queryClient.invalidateQueries({ queryKey: ['admin-v3-spells'] });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const openEditor = (spell: V3Spell) => {
    setEditing(spell);
    setName(spell.name || '');
    setDescription(spell.description || '');
    setImage(spell.image || null);
  };

  const openCreate = () => {
    setCreating(true);
    setComposition(EMPTY_V3_COMPOSITION);
    setName('');
    setDescription('');
    setImage(null);
  };

  const createValid = isValidV3Composition(composition) && !!name.trim();

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      awaiting_gm: 'bg-amber-900/40 text-amber-300 border-amber-700',
      ready: 'bg-blue-900/40 text-blue-300 border-blue-700',
      approved: 'bg-emerald-900/40 text-emerald-300 border-emerald-700',
      rejected: 'bg-red-900/40 text-red-300 border-red-700',
    };
    const label: Record<string, string> = {
      awaiting_gm: 'Awaiting GM',
      ready: 'Ready',
      approved: 'Approved',
      rejected: 'Rejected',
    };
    return <Badge variant="outline" className={map[status] || ''}>{label[status] || status}</Badge>;
  };

  const formula = (comp: V3SpellComposition) => {
    const parts: { text: string; color: string }[] = [];
    if (comp?.core) parts.push({ text: V3_ELEMENT_MAP[comp.core]?.name ?? comp.core, color: v3RoleColor(V3_CORE_ROLE_KEY) });
    (comp?.secondaries || []).forEach((s) => {
      parts.push({ text: `${V3_ELEMENT_MAP[s.element]?.name ?? s.element} (${V3_ROLE_MAP[s.role]?.name ?? s.role})`, color: v3RoleColor(s.role) });
    });
    return (
      <div className="flex flex-wrap items-center gap-1 text-xs">
        {parts.map((p, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-stone-600">+</span>}
            <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: `${p.color}22`, color: p.color, border: `1px solid ${p.color}66` }}>{p.text}</span>
          </span>
        ))}
        <span className="text-stone-600 mx-1">·</span>
        <span className="text-stone-400">{V3_INTENT_MAP[comp?.intent]?.name} / {V3_DELIVERY_MAP[comp?.delivery]?.name} / {V3_REACH_MAP[comp?.reach]?.name} / {V3_DURATION_MAP[comp?.duration]?.name}</span>
      </div>
    );
  };

  if (isLoading) {
    return <p className="text-stone-400" data-testid="text-v3-spells-loading">Loading crafted spells…</p>;
  }

  return (
    <div className="space-y-3" data-testid="view-v3-spells">
      <div className="flex items-center justify-between gap-2">
        <Select value={filter} onValueChange={(v) => setFilter(v as V3SpellFilter)}>
          <SelectTrigger className="w-[180px] h-9 bg-stone-900 border-stone-700 text-stone-200" data-testid="select-v3-spell-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="official">Official only</SelectItem>
            <SelectItem value="needs_approval">Needs approval</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" className="bg-violet-700 hover:bg-violet-600 text-stone-50" onClick={openCreate} data-testid="button-create-v3-spell">
          <Plus className="h-4 w-4 mr-1" /> Create Spell
        </Button>
      </div>
      {filteredSpells.length === 0 && (
        <p className="text-stone-500 italic" data-testid="text-v3-spells-empty">
          {filter === 'official'
            ? 'No official spells yet. Approve a crafted spell or create one to make it official.'
            : filter === 'needs_approval'
            ? 'Nothing waiting for approval right now.'
            : 'No crafted spells yet. Player-crafted spells will appear here for review.'}
        </p>
      )}
      {filteredSpells.map((spell) => (
        <Card key={spell.id} className="bg-stone-900 border-stone-700" data-testid={`card-v3-spell-${spell.id}`}>
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <div className="h-14 w-14 shrink-0 rounded-lg border border-stone-700 bg-stone-800 overflow-hidden flex items-center justify-center">
                {spell.image ? <img src={spell.image} alt={spell.name} className="h-full w-full object-cover" /> : <Sparkles className="h-5 w-5 text-stone-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-base text-stone-100" data-testid={`text-v3-spell-name-${spell.id}`}>
                    {spell.name || <span className="italic text-stone-500">Unnamed</span>}
                  </CardTitle>
                  {statusBadge(spell.status)}
                  {spell.isCanonical && <Badge variant="outline" className="bg-violet-900/40 text-violet-300 border-violet-700">Canonical</Badge>}
                  {spell.flagged && <Badge variant="outline" className="bg-orange-900/40 text-orange-300 border-orange-700" data-testid={`badge-flagged-${spell.id}`}>Profane</Badge>}
                </div>
                <div className="mt-1.5">{formula(spell.composition)}</div>
                {spell.description && <p className="text-xs text-stone-400 mt-1.5 line-clamp-2">{spell.description}</p>}
                <p className="text-[11px] text-stone-500 mt-1">{spell.manaCost} mana · DC {spell.craftDc}</p>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEditor(spell)} data-testid={`button-edit-v3-spell-${spell.id}`}>
                  <Pencil className="h-3 w-3 mr-1" /> Edit
                </Button>
                {spell.status !== 'approved' && (
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-emerald-700 hover:bg-emerald-600"
                    disabled={!spell.name?.trim() || approveMutation.isPending}
                    onClick={() => approveMutation.mutate(spell.id)}
                    data-testid={`button-approve-v3-spell-${spell.id}`}
                  >
                    Approve
                  </Button>
                )}
                {spell.status !== 'rejected' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-red-400 border-red-900 hover:bg-red-900/30"
                    disabled={rejectMutation.isPending}
                    onClick={() => rejectMutation.mutate(spell.id)}
                    data-testid={`button-reject-v3-spell-${spell.id}`}
                  >
                    Reject
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs text-red-400 border-red-900 hover:bg-red-900/30"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete "${spell.name || 'this spell'}"? This cannot be undone.`)) {
                      deleteMutation.mutate(spell.id);
                    }
                  }}
                  data-testid={`button-delete-v3-spell-${spell.id}`}
                >
                  <Trash2 className="h-3 w-3 mr-1" /> Delete
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>
      ))}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg" data-testid="dialog-edit-v3-spell">
          <DialogHeader>
            <DialogTitle>Edit Spell Details</DialogTitle>
            <DialogDescription>Set the canonical name, description, and image for this composition.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="rounded-lg border border-stone-700 bg-stone-900/60 p-2">{formula(editing.composition)}</div>
              <div className="flex gap-3">
                <div className="h-20 w-20 shrink-0 rounded-lg border border-stone-700 bg-stone-900 overflow-hidden flex items-center justify-center" data-testid="img-v3-spell-preview">
                  {image ? <img src={image} alt="Spell" className="h-full w-full object-cover" /> : <ImageIcon className="h-6 w-6 text-stone-500" />}
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-stone-400">Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-v3-spell-name" />
                  <div className="flex gap-2 pt-1">
                    <Button type="button" variant="outline" size="sm" className="border-stone-600 h-7 text-xs" onClick={() => spellImageInputRef.current?.click()} data-testid="button-v3-spell-upload">Upload</Button>
                    <Button type="button" variant="outline" size="sm" className="border-stone-600 h-7 text-xs" onClick={() => setShowImageBrowser(true)} data-testid="button-v3-spell-browse"><Library className="h-3 w-3 mr-1" /> Browse</Button>
                    {image && <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-red-400" onClick={() => setImage(null)} data-testid="button-v3-spell-clear-image">Clear</Button>}
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-stone-400">Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} data-testid="input-v3-spell-description" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => editing && editMutation.mutate({ id: editing.id, name: name.trim(), description, image })}
              disabled={!name.trim() || editMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-stone-950"
              data-testid="button-save-v3-spell"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-create-v3-spell">
          <DialogHeader>
            <DialogTitle>Create Recognized Spell</DialogTitle>
            <DialogDescription>Define a composition plus its canonical name, description, and image. It is saved as approved and recognized everywhere.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <V3CompositionBuilder value={composition} onChange={setComposition} />
            <div className="flex gap-3">
              <div className="h-20 w-20 shrink-0 rounded-lg border border-stone-700 bg-stone-900 overflow-hidden flex items-center justify-center" data-testid="img-create-v3-spell-preview">
                {image ? <img src={image} alt="Spell" className="h-full w-full object-cover" /> : <ImageIcon className="h-6 w-6 text-stone-500" />}
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs text-stone-400">Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-create-v3-spell-name" />
                <div className="flex gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" className="border-stone-600 h-7 text-xs" onClick={() => spellImageInputRef.current?.click()} data-testid="button-create-v3-spell-upload">Upload</Button>
                  <Button type="button" variant="outline" size="sm" className="border-stone-600 h-7 text-xs" onClick={() => setShowImageBrowser(true)} data-testid="button-create-v3-spell-browse"><Library className="h-3 w-3 mr-1" /> Browse</Button>
                  {image && <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-red-400" onClick={() => setImage(null)} data-testid="button-create-v3-spell-clear-image">Clear</Button>}
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-stone-400">Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} data-testid="input-create-v3-spell-description" />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => createMutation.mutate({ composition, name: name.trim(), description, image })}
              disabled={!createValid || createMutation.isPending}
              className="bg-violet-700 hover:bg-violet-600 text-stone-50"
              data-testid="button-save-create-v3-spell"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <input ref={spellImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleSpellImageUpload} data-testid="input-v3-spell-file" />
      <ImageBrowser open={showImageBrowser} onOpenChange={setShowImageBrowser} onSelect={(url) => setImage(url)} title="Select Spell Image" />

      <Dialog open={!!conflict} onOpenChange={(o) => { if (!o) setConflict(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-v3-spell-conflict">
          <DialogHeader>
            <DialogTitle>Duplicate Recipe</DialogTitle>
            <DialogDescription>
              Another official spell already exists for this exact recipe. Only one can be the official version. Compare them below and choose which one to keep — spells already used in campaigns are never changed.
            </DialogDescription>
          </DialogHeader>
          {conflict && (
            <div className="space-y-3">
              {conflict.usage && (conflict.usage.campaignCount > 0 || conflict.usage.characterCount > 0) ? (
                <div className="rounded-md border border-amber-700 bg-amber-900/20 px-3 py-2 text-xs text-amber-200" data-testid="conflict-usage">
                  This recipe is already in play: {conflict.usage.campaignCount} campaign{conflict.usage.campaignCount === 1 ? '' : 's'} · {conflict.usage.characterCount} character{conflict.usage.characterCount === 1 ? '' : 's'}. Those copies stay exactly as they are no matter which you pick.
                </div>
              ) : (
                <div className="rounded-md border border-stone-700 bg-stone-900/60 px-3 py-2 text-xs text-stone-400" data-testid="conflict-usage">
                  Not used in any campaigns or by any characters yet.
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([
                  { label: 'Current official', spell: conflict.existing, accent: 'border-violet-700 bg-violet-900/20', tag: 'text-violet-300', testid: 'conflict-existing' },
                  { label: 'This spell', spell: conflict.candidate, accent: 'border-stone-700 bg-stone-900/60', tag: 'text-stone-400', testid: 'conflict-candidate' },
                ] as const).map(({ label, spell, accent, tag, testid }) => (
                  <div key={testid} className={`rounded-lg border ${accent} p-3 space-y-2`} data-testid={testid}>
                    <p className={`text-[11px] uppercase tracking-wide ${tag}`}>{label}</p>
                    <div className="flex items-start gap-3">
                      <div className="h-16 w-16 shrink-0 rounded-lg border border-stone-700 bg-stone-800 overflow-hidden flex items-center justify-center">
                        {spell.image ? <img src={spell.image} alt={spell.name} className="h-full w-full object-cover" /> : <Sparkles className="h-5 w-5 text-stone-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-100 break-words">{spell.name || <span className="italic text-stone-500">Unnamed</span>}</p>
                        <p className="text-[11px] text-stone-500 mt-0.5">{spell.manaCost} mana · DC {spell.craftDc}</p>
                      </div>
                    </div>
                    <div>{formula(spell.composition)}</div>
                    {spell.description ? (
                      <p className="text-xs text-stone-400 whitespace-pre-wrap">{spell.description}</p>
                    ) : (
                      <p className="text-xs italic text-stone-600">No description.</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button
              className="w-full bg-violet-700 hover:bg-violet-600 text-stone-50"
              disabled={resolveMutation.isPending}
              onClick={() => conflict && resolveMutation.mutate({ id: conflict.candidate.id, resolution: 'keep_this' })}
              data-testid="button-conflict-keep-this"
            >
              Keep this one (make it official)
            </Button>
            <Button
              variant="outline"
              className="w-full border-stone-600"
              disabled={resolveMutation.isPending}
              onClick={() => conflict && resolveMutation.mutate({ id: conflict.candidate.id, resolution: 'keep_other' })}
              data-testid="button-conflict-keep-other"
            >
              Keep the current official
            </Button>
            <Button
              variant="ghost"
              className="w-full text-stone-400"
              disabled={resolveMutation.isPending}
              onClick={() => { setConflict(null); queryClient.invalidateQueries({ queryKey: ['admin-v3-spells'] }); }}
              data-testid="button-conflict-decide-later"
            >
              Decide later
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Searchable picker for OPEN-ENDED admin lists (Knowledge, items, techniques,
// technique groups). "Open-ended" = the admin can create more of these at any
// time, so a dropdown/checkbox list would grow without bound. This mirrors the
// "add item to a character sheet" search panel. Fixed lists (the 14 V3 skills,
// 17 elements, 6 attributes, item types, rarities) stay as dropdowns.
function AdminSearchPicker({
  options,
  value,
  onChange,
  placeholder,
  emptyText,
  testId,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  emptyText?: string;
  testId: string;
}) {
  const [search, setSearch] = useState('');
  const selected = options.find((o) => o.value === value);
  const trimmed = search.trim().toLowerCase();
  const filtered = (trimmed
    ? options.filter((o) => o.label.toLowerCase().includes(trimmed))
    : options
  ).slice(0, 100);
  return (
    <div className="space-y-1">
      {selected && (
        <div className="flex items-center justify-between gap-2 rounded border border-stone-700 bg-stone-950/40 px-2 py-1.5 text-xs" data-testid={`selected-${testId}`}>
          <span className="text-stone-200 truncate">{selected.label}</span>
          <Button type="button" size="icon" variant="ghost" className="h-5 w-5 text-stone-400 hover:text-red-400" onClick={() => onChange('')} data-testid={`button-clear-${testId}`}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
      {options.length === 0 ? (
        <p className="text-xs text-stone-500 italic px-1 py-1" data-testid={`empty-${testId}`}>{emptyText ?? 'Nothing to choose yet.'}</p>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-500 pointer-events-none" />
            <Input className="pl-7 h-8 text-xs" placeholder={placeholder ?? 'Search…'} value={search} onChange={(e) => setSearch(e.target.value)} data-testid={`input-${testId}-search`} />
          </div>
          <div className="max-h-40 overflow-y-auto border border-stone-700 rounded bg-stone-800" data-testid={`list-${testId}`}>
            {filtered.length === 0 ? (
              <p className="text-xs text-stone-500 p-2 italic">No matches</p>
            ) : (
              filtered.map((o) => (
                <button key={o.value} type="button" className="w-full text-left px-2 py-1.5 text-xs text-stone-300 hover:bg-stone-700 transition-colors" onClick={() => { onChange(o.value); setSearch(''); }} data-testid={`button-${testId}-option-${o.value}`}>
                  {o.label}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Multi-select variant of AdminSearchPicker: selected items show as a removable
// list, and the search field adds more from the same open-ended pool.
function AdminSearchMultiPicker({
  options,
  selectedIds,
  onAdd,
  onRemove,
  placeholder,
  emptyText,
  testId,
}: {
  options: { value: string; label: string }[];
  selectedIds: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  placeholder?: string;
  emptyText?: string;
  testId: string;
}) {
  const [search, setSearch] = useState('');
  const selSet = new Set(selectedIds);
  const selectedOptions = options.filter((o) => selSet.has(o.value));
  const trimmed = search.trim().toLowerCase();
  const filtered = options
    .filter((o) => !selSet.has(o.value) && (!trimmed || o.label.toLowerCase().includes(trimmed)))
    .slice(0, 100);
  return (
    <div className="space-y-1.5">
      {selectedOptions.length > 0 && (
        <div className="space-y-1" data-testid={`selected-list-${testId}`}>
          {selectedOptions.map((o) => (
            <div key={o.value} className="flex items-center justify-between gap-2 rounded border border-stone-700 bg-stone-950/40 px-2 py-1 text-xs">
              <span className="text-stone-200 truncate">{o.label}</span>
              <Button type="button" size="icon" variant="ghost" className="h-5 w-5 text-stone-400 hover:text-red-400" onClick={() => onRemove(o.value)} data-testid={`button-remove-${testId}-${o.value}`}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
      {options.length === 0 ? (
        <p className="text-xs text-stone-500 italic px-1 py-1" data-testid={`empty-${testId}`}>{emptyText ?? 'Nothing to choose yet.'}</p>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-500 pointer-events-none" />
            <Input className="pl-7 h-8 text-xs" placeholder={placeholder ?? 'Search…'} value={search} onChange={(e) => setSearch(e.target.value)} data-testid={`input-${testId}-search`} />
          </div>
          <div className="max-h-40 overflow-y-auto border border-stone-700 rounded bg-stone-800" data-testid={`list-${testId}`}>
            {filtered.length === 0 ? (
              <p className="text-xs text-stone-500 p-2 italic">{trimmed ? 'No matches' : 'All selected'}</p>
            ) : (
              filtered.map((o) => (
                <button key={o.value} type="button" className="w-full text-left px-2 py-1.5 text-xs text-stone-300 hover:bg-stone-700 transition-colors" onClick={() => { onAdd(o.value); setSearch(''); }} data-testid={`button-${testId}-option-${o.value}`}>
                  {o.label}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function V3ElementRequirementsView({ systemSlug }: { systemSlug: string }) {
  const queryClient = useQueryClient();
  const [element, setElement] = useState<string>(V3_ELEMENTS[0]?.key ?? '');
  const [conditionType, setConditionType] = useState<'knowledge' | 'item'>('knowledge');
  const [knowledgeName, setKnowledgeName] = useState<string>('');
  const [itemId, setItemId] = useState<string>('');
  const [consumed, setConsumed] = useState(false);

  const { data: requirements = [], isLoading } = useQuery({
    queryKey: ['admin-v3-element-requirements'],
    queryFn: () => api.getAdminV3ElementRequirements(),
  });

  // Knowledge picker = the V3 system custom skills ("Knowledge").
  const { data: knowledgeOptions = [] } = useQuery({
    queryKey: ['system-skills', 'aa-v3'],
    queryFn: () => api.getSystemSkills('aa-v3'),
  });

  // Item picker = admin V3 system items.
  const { data: itemOptions = [] } = useQuery({
    queryKey: ['admin-system-items', 'aa-v3'],
    queryFn: () => api.getSystemItems('aa-v3'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-v3-element-requirements'] });

  const createMutation = useMutation({
    mutationFn: () => {
      if (conditionType === 'knowledge') {
        return api.createV3ElementRequirement({ element, conditionType: 'knowledge', knowledgeName });
      }
      const it = (itemOptions as any[]).find((i) => i.id === itemId);
      return api.createV3ElementRequirement({ element, conditionType: 'item', itemId, itemName: it?.name ?? null, consumed });
    },
    onSuccess: () => {
      toast({ title: 'Requirement added' });
      setKnowledgeName('');
      setItemId('');
      setConsumed(false);
      invalidate();
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const toggleConsumedMutation = useMutation({
    mutationFn: (vars: { id: string; consumed: boolean }) => api.updateV3ElementRequirement(vars.id, { consumed: vars.consumed }),
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteV3ElementRequirement(id),
    onSuccess: () => { toast({ title: 'Requirement removed' }); invalidate(); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const canCreate = !!element && (conditionType === 'knowledge' ? !!knowledgeName : !!itemId);

  const byElement = useMemo(() => {
    const map: Record<string, typeof requirements> = {};
    for (const r of requirements) (map[r.element] ||= []).push(r);
    return map;
  }, [requirements]);

  if (systemSlug !== 'aa-v3') {
    return <p className="text-stone-400">Element requirements are only available in the A.A. V3 system.</p>;
  }

  return (
    <div className="space-y-6" data-testid="view-element-requirements">
      <Card className="bg-stone-900 border-stone-700">
        <CardHeader>
          <CardTitle className="text-amber-400 text-base">Add Requirement</CardTitle>
          <CardDescription className="text-stone-400">
            Conditions for an element are OR'd: a player may use the element if they satisfy <span className="text-stone-300">any</span> one of them.
            An element with no requirements is freely usable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-stone-400">Element</Label>
              <Select value={element} onValueChange={setElement}>
                <SelectTrigger data-testid="select-req-element"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {V3_ELEMENTS.map((el) => <SelectItem key={el.key} value={el.key}>{el.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-stone-400">Condition Type</Label>
              <Select value={conditionType} onValueChange={(v) => setConditionType(v as 'knowledge' | 'item')}>
                <SelectTrigger data-testid="select-req-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="knowledge">Knowledge</SelectItem>
                  <SelectItem value="item">Item</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {conditionType === 'knowledge' ? (
            <div className="space-y-1">
              <Label className="text-xs text-stone-400">Required Knowledge</Label>
              <AdminSearchPicker
                options={(knowledgeOptions as any[]).map((k) => ({ value: k.name, label: k.name }))}
                value={knowledgeName}
                onChange={setKnowledgeName}
                placeholder="Search Knowledge…"
                emptyText="No Knowledge defined yet."
                testId="req-knowledge"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs text-stone-400">Required Item</Label>
                <AdminSearchPicker
                  options={(itemOptions as any[]).map((it) => ({ value: it.id, label: it.name }))}
                  value={itemId}
                  onChange={setItemId}
                  placeholder="Search items…"
                  emptyText="No items defined yet."
                  testId="req-item"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
                <Checkbox checked={consumed} onCheckedChange={(c) => setConsumed(!!c)} data-testid="checkbox-req-consumed" />
                Consume this item on a successful craft
              </label>
            </div>
          )}

          <Button
            onClick={() => createMutation.mutate()}
            disabled={!canCreate || createMutation.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-stone-950"
            data-testid="button-add-requirement"
          >
            <Plus className="h-4 w-4 mr-1" /> Add Requirement
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-stone-400">Loading…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {V3_ELEMENTS.map((el) => {
            const reqs = byElement[el.key] ?? [];
            return (
              <Card key={el.key} className="bg-stone-900 border-stone-700" data-testid={`card-req-element-${el.key}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {reqs.length > 0 ? <Lock className="h-3.5 w-3.5 text-amber-500" /> : <Sparkles className="h-3.5 w-3.5 text-stone-500" />}
                    {el.name}
                  </CardTitle>
                  {reqs.length === 0 && <CardDescription className="text-xs text-stone-500">Freely usable</CardDescription>}
                </CardHeader>
                {reqs.length > 0 && (
                  <CardContent className="space-y-1.5 pt-0">
                    {reqs.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-2 rounded border border-stone-700 bg-stone-950/40 px-2 py-1.5" data-testid={`row-requirement-${r.id}`}>
                        <div className="min-w-0 text-xs">
                          {r.conditionType === 'knowledge' ? (
                            <span className="text-violet-300">Knowledge: {r.knowledgeName}</span>
                          ) : (
                            <span className="text-emerald-300">
                              Item: {r.itemName}
                              {r.consumed && <span className="text-amber-400"> (consumed)</span>}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {r.conditionType === 'item' && (
                            <label className="flex items-center gap-1 text-[10px] text-stone-400 cursor-pointer">
                              <Checkbox
                                checked={r.consumed}
                                onCheckedChange={(c) => toggleConsumedMutation.mutate({ id: r.id, consumed: !!c })}
                                data-testid={`checkbox-toggle-consumed-${r.id}`}
                              />
                              consume
                            </label>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-stone-400 hover:text-red-400"
                            onClick={() => deleteMutation.mutate(r.id)}
                            data-testid={`button-delete-requirement-${r.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// AA V3 Weapon Techniques (Task #180)
// ===========================================================================
type TechniqueDraftCondition = {
  conditionType: 'knowledge' | 'item';
  knowledgeName?: string | null;
  itemId?: string | null;
  itemName?: string | null;
  consumed?: boolean;
};

function V3TechniquesView({ systemSlug }: { systemSlug: string }) {
  const queryClient = useQueryClient();
  const emptyDraft = {
    id: null as string | null,
    name: '',
    image: null as string | null,
    description: '',
    energyCost: 0,
    rollMode: 'base_damage' as 'base_damage' | 'skill_check',
    skillKey: '' as string,
    requirements: [] as TechniqueDraftCondition[],
  };
  const [draft, setDraft] = useState(emptyDraft);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showImageBrowser, setShowImageBrowser] = useState(false);
  // Inline condition builder state
  const [condType, setCondType] = useState<'knowledge' | 'item'>('knowledge');
  const [condKnowledge, setCondKnowledge] = useState('');
  const [condItemId, setCondItemId] = useState('');
  const [condConsumed, setCondConsumed] = useState(false);

  const { data: techniques = [], isLoading } = useQuery({
    queryKey: ['admin-v3-techniques'],
    queryFn: () => api.getAdminV3Techniques(),
  });
  const { data: knowledgeOptions = [] } = useQuery({
    queryKey: ['system-skills', 'aa-v3'],
    queryFn: () => api.getSystemSkills('aa-v3'),
  });
  const { data: itemOptions = [] } = useQuery({
    queryKey: ['admin-system-items', 'aa-v3'],
    queryFn: () => api.getSystemItems('aa-v3'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-v3-techniques'] });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: draft.name,
        image: draft.image,
        description: draft.description || null,
        energyCost: draft.energyCost,
        rollMode: draft.rollMode,
        skillKey: draft.rollMode === 'skill_check' ? (draft.skillKey || null) : null,
        requirements: draft.requirements,
      };
      return draft.id ? api.updateV3Technique(draft.id, payload) : api.createV3Technique(payload);
    },
    onSuccess: () => {
      toast({ title: draft.id ? 'Technique updated' : 'Technique created' });
      setDialogOpen(false);
      setDraft(emptyDraft);
      invalidate();
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteV3Technique(id),
    onSuccess: () => { toast({ title: 'Technique removed' }); invalidate(); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const openCreate = () => { setDraft(emptyDraft); setDialogOpen(true); };
  const openEdit = (t: any) => {
    setDraft({
      id: t.id,
      name: t.name,
      image: t.image ?? null,
      description: t.description ?? '',
      energyCost: t.energyCost ?? 0,
      rollMode: t.rollMode === 'skill_check' ? 'skill_check' : 'base_damage',
      skillKey: t.skillKey ?? '',
      requirements: Array.isArray(t.requirements) ? t.requirements : [],
    });
    setDialogOpen(true);
  };

  const addCondition = () => {
    if (condType === 'knowledge') {
      if (!condKnowledge) return;
      setDraft((d) => ({ ...d, requirements: [...d.requirements, { conditionType: 'knowledge', knowledgeName: condKnowledge }] }));
      setCondKnowledge('');
    } else {
      if (!condItemId) return;
      const it = (itemOptions as any[]).find((i) => i.id === condItemId);
      setDraft((d) => ({ ...d, requirements: [...d.requirements, { conditionType: 'item', itemId: condItemId, itemName: it?.name ?? null, consumed: condConsumed }] }));
      setCondItemId('');
      setCondConsumed(false);
    }
  };
  const removeCondition = (idx: number) => setDraft((d) => ({ ...d, requirements: d.requirements.filter((_, i) => i !== idx) }));

  if (systemSlug !== 'aa-v3') {
    return <p className="text-stone-400">Techniques are only available in the A.A. V3 system.</p>;
  }

  return (
    <div className="space-y-4" data-testid="view-techniques">
      <div className="flex justify-end">
        <Button onClick={openCreate} className="bg-rose-600 hover:bg-rose-700 text-stone-950" data-testid="button-add-technique">
          <Plus className="h-4 w-4 mr-1" /> New Technique
        </Button>
      </div>

      {isLoading ? (
        <p className="text-stone-400">Loading…</p>
      ) : techniques.length === 0 ? (
        <p className="text-stone-400">No techniques defined yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {techniques.map((t) => (
            <Card key={t.id} className="bg-stone-900 border-stone-700" data-testid={`card-technique-${t.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start gap-2">
                  {t.image ? (
                    <img src={t.image} alt={t.name} className="h-10 w-10 rounded object-cover border border-stone-700" />
                  ) : (
                    <div className="h-10 w-10 rounded bg-stone-800 flex items-center justify-center"><Sword className="h-5 w-5 text-stone-500" /></div>
                  )}
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-sm text-rose-400 truncate">{t.name}</CardTitle>
                    <CardDescription className="text-xs text-stone-400">
                      <span className="text-amber-400">{t.energyCost} energy</span>
                      {' · '}
                      {t.rollMode === 'skill_check'
                        ? `Skill: ${V3_SKILLS.find((s) => s.key === t.skillKey)?.name ?? t.skillKey ?? '—'}`
                        : 'Base damage'}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {t.description && <p className="text-xs text-stone-400 line-clamp-3">{t.description}</p>}
                {Array.isArray(t.requirements) && t.requirements.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {t.requirements.map((r, i) => (
                      <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded ${r.conditionType === 'knowledge' ? 'bg-violet-900/40 text-violet-300' : 'bg-emerald-900/40 text-emerald-300'}`}>
                        {r.conditionType === 'knowledge' ? r.knowledgeName : r.itemName}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-[10px] text-stone-500">No unlock requirements</span>
                )}
                <div className="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-stone-400 hover:text-amber-400" onClick={() => openEdit(t)} data-testid={`button-edit-technique-${t.id}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-stone-400 hover:text-red-400" onClick={() => deleteMutation.mutate(t.id)} data-testid={`button-delete-technique-${t.id}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-stone-900 border-stone-700 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-rose-400">{draft.id ? 'Edit Technique' : 'New Technique'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {draft.image ? (
                <img src={draft.image} alt="" className="h-16 w-16 rounded object-cover border border-stone-700" />
              ) : (
                <div className="h-16 w-16 rounded bg-stone-800 flex items-center justify-center"><Sword className="h-7 w-7 text-stone-500" /></div>
              )}
              <div className="flex flex-col gap-1">
                <Button variant="outline" size="sm" onClick={() => setShowImageBrowser(true)} data-testid="button-technique-image">
                  <ImageIcon className="h-4 w-4 mr-1" /> Choose Image
                </Button>
                {draft.image && <Button variant="ghost" size="sm" className="text-stone-400" onClick={() => setDraft((d) => ({ ...d, image: null }))}>Remove</Button>}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-stone-400">Name</Label>
              <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} data-testid="input-technique-name" />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-stone-400">Description</Label>
              <Textarea value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} rows={3} data-testid="input-technique-description" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-stone-400">Energy Cost</Label>
                <Input type="number" min={0} value={draft.energyCost} onChange={(e) => setDraft((d) => ({ ...d, energyCost: Math.max(0, parseInt(e.target.value) || 0) }))} data-testid="input-technique-energy" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-stone-400">Roll Mode</Label>
                <Select value={draft.rollMode} onValueChange={(v) => setDraft((d) => ({ ...d, rollMode: v as 'base_damage' | 'skill_check' }))}>
                  <SelectTrigger data-testid="select-technique-rollmode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="base_damage">Base Damage</SelectItem>
                    <SelectItem value="skill_check">Skill Check</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {draft.rollMode === 'skill_check' && (
              <div className="space-y-1">
                <Label className="text-xs text-stone-400">Skill</Label>
                <Select value={draft.skillKey} onValueChange={(v) => setDraft((d) => ({ ...d, skillKey: v }))}>
                  <SelectTrigger data-testid="select-technique-skill"><SelectValue placeholder="Select Skill" /></SelectTrigger>
                  <SelectContent>
                    {V3_SKILLS.map((s) => <SelectItem key={s.key} value={s.key}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2 rounded border border-stone-700 p-3">
              <Label className="text-xs text-stone-400">Unlock Requirements (any one unlocks)</Label>
              {draft.requirements.length > 0 && (
                <div className="space-y-1">
                  {draft.requirements.map((r, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 rounded bg-stone-950/40 px-2 py-1 text-xs">
                      <span className={r.conditionType === 'knowledge' ? 'text-violet-300' : 'text-emerald-300'}>
                        {r.conditionType === 'knowledge' ? `Knowledge: ${r.knowledgeName}` : `Item: ${r.itemName}${r.consumed ? ' (consumed)' : ''}`}
                      </span>
                      <Button size="icon" variant="ghost" className="h-5 w-5 text-stone-400 hover:text-red-400" onClick={() => removeCondition(i)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                <div className="w-28 space-y-1">
                  <Label className="text-[10px] text-stone-500">Type</Label>
                  <Select value={condType} onValueChange={(v) => setCondType(v as 'knowledge' | 'item')}>
                    <SelectTrigger className="h-8" data-testid="select-cond-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="knowledge">Knowledge</SelectItem>
                      <SelectItem value="item">Item</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {condType === 'knowledge' ? (
                  <div className="space-y-1">
                    <Label className="text-[10px] text-stone-500">Knowledge</Label>
                    <AdminSearchPicker
                      options={(knowledgeOptions as any[]).map((k) => ({ value: k.name, label: k.name }))}
                      value={condKnowledge}
                      onChange={setCondKnowledge}
                      placeholder="Search Knowledge…"
                      emptyText="No Knowledge defined yet."
                      testId="cond-knowledge"
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label className="text-[10px] text-stone-500">Item</Label>
                    <AdminSearchPicker
                      options={(itemOptions as any[]).map((it) => ({ value: it.id, label: it.name }))}
                      value={condItemId}
                      onChange={setCondItemId}
                      placeholder="Search items…"
                      emptyText="No items defined yet."
                      testId="cond-item"
                    />
                  </div>
                )}
                <Button size="sm" variant="outline" onClick={addCondition} data-testid="button-add-condition">Add</Button>
              </div>
              {condType === 'item' && (
                <label className="flex items-center gap-2 text-xs text-stone-400 cursor-pointer">
                  <Checkbox checked={condConsumed} onCheckedChange={(c) => setCondConsumed(!!c)} /> Consume item on use
                </label>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!draft.name.trim() || (draft.rollMode === 'skill_check' && !draft.skillKey) || saveMutation.isPending}
                className="bg-rose-600 hover:bg-rose-700 text-stone-950"
                data-testid="button-save-technique"
              >
                {draft.id ? 'Save' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ImageBrowser open={showImageBrowser} onOpenChange={setShowImageBrowser} onSelect={(url) => setDraft((d) => ({ ...d, image: url }))} title="Select Technique Image" />
    </div>
  );
}

function V3TechniqueGroupsView({ systemSlug }: { systemSlug: string }) {
  const queryClient = useQueryClient();
  const [newGroupName, setNewGroupName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['admin-v3-technique-groups'],
    queryFn: () => api.getAdminV3TechniqueGroups(),
  });
  const { data: techniques = [] } = useQuery({
    queryKey: ['admin-v3-techniques'],
    queryFn: () => api.getAdminV3Techniques(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-v3-technique-groups'] });

  const createMutation = useMutation({
    mutationFn: () => api.createV3TechniqueGroup({ name: newGroupName.trim() }),
    onSuccess: () => { toast({ title: 'Group created' }); setNewGroupName(''); invalidate(); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const renameMutation = useMutation({
    mutationFn: (vars: { id: string; name: string }) => api.updateV3TechniqueGroup(vars.id, { name: vars.name }),
    onSuccess: () => { toast({ title: 'Group renamed' }); setEditingId(null); invalidate(); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteV3TechniqueGroup(id),
    onSuccess: () => { toast({ title: 'Group removed' }); invalidate(); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const toggleMemberMutation = useMutation({
    mutationFn: (vars: { groupId: string; techniqueId: string; member: boolean }) =>
      vars.member
        ? api.addV3TechniqueGroupMember(vars.groupId, vars.techniqueId)
        : api.removeV3TechniqueGroupMember(vars.groupId, vars.techniqueId),
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  if (systemSlug !== 'aa-v3') {
    return <p className="text-stone-400">Weapon techniques are only available in the A.A. V3 system.</p>;
  }

  return (
    <div className="space-y-4" data-testid="view-technique-groups">
      <Card className="bg-stone-900 border-stone-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-rose-400 text-base">New Group</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="Group name" data-testid="input-group-name" />
          <Button onClick={() => createMutation.mutate()} disabled={!newGroupName.trim() || createMutation.isPending} className="bg-rose-600 hover:bg-rose-700 text-stone-950" data-testid="button-add-group">
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-stone-400">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="text-stone-400">No technique groups yet.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {groups.map((g) => {
            return (
              <Card key={g.id} className="bg-stone-900 border-stone-700" data-testid={`card-group-${g.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    {editingId === g.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" data-testid={`input-rename-group-${g.id}`} />
                        <Button size="sm" className="bg-rose-600 hover:bg-rose-700 text-stone-950" onClick={() => renameMutation.mutate({ id: g.id, name: editName.trim() })} disabled={!editName.trim()}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <>
                        <CardTitle className="text-sm text-rose-400">{g.name}</CardTitle>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-stone-400 hover:text-amber-400" onClick={() => { setEditingId(g.id); setEditName(g.name); }} data-testid={`button-rename-group-${g.id}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-stone-400 hover:text-red-400" onClick={() => deleteMutation.mutate(g.id)} data-testid={`button-delete-group-${g.id}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-1.5 pt-0">
                  <AdminSearchMultiPicker
                    options={(techniques as any[]).map((t) => ({ value: t.id, label: t.name }))}
                    selectedIds={g.techniqueIds}
                    onAdd={(id) => toggleMemberMutation.mutate({ groupId: g.id, techniqueId: id, member: true })}
                    onRemove={(id) => toggleMemberMutation.mutate({ groupId: g.id, techniqueId: id, member: false })}
                    placeholder="Search techniques…"
                    emptyText="No techniques defined yet."
                    testId={`group-member-${g.id}`}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DashCard({
  onClick,
  testId,
  icon: Icon,
  title,
  description,
  hoverBorder = 'hover:border-amber-600',
  iconBg = 'bg-amber-700/20',
  iconColor = 'text-amber-500',
  titleColor = 'text-amber-500',
  descColor = 'text-stone-400',
}: {
  onClick: () => void;
  testId: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  hoverBorder?: string;
  iconBg?: string;
  iconColor?: string;
  titleColor?: string;
  descColor?: string;
}) {
  return (
    <Card
      className={`bg-stone-900 border-stone-700 cursor-pointer ${hoverBorder} transition-colors`}
      onClick={onClick}
      data-testid={testId}
    >
      <CardHeader>
        <div className={`h-12 w-12 rounded-lg ${iconBg} flex items-center justify-center mb-2`}>
          <Icon className={`h-6 w-6 ${iconColor}`} />
        </div>
        <CardTitle className={titleColor}>{title}</CardTitle>
        <CardDescription className={descColor}>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function DashSection({
  title,
  icon: Icon,
  color,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <section data-testid={`dash-section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
      <div className={`flex items-center gap-2 mb-3 ${color}`}>
        <Icon className="h-4 w-4" />
        <h3 className="text-sm font-semibold uppercase tracking-wide">{title}</h3>
        <div className="flex-1 h-px bg-stone-800 ml-2" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">{children}</div>
    </section>
  );
}

function DashboardView({ onNavigate, systemSlug, isAdmin }: { onNavigate: (view: AdminView) => void; systemSlug: string; isAdmin: boolean }) {
  const isPersonalLibSystem = systemSlug === 'aa-v2' || systemSlug === 'aa-v3';

  if (systemSlug === 'aa-v3') {
    return (
      <div className="space-y-8" data-testid="dashboard-v3">
        {isAdmin && (
          <DashSection title="Spells & Magic" icon={Wand2} color="text-violet-400">
            <DashCard
              onClick={() => onNavigate('v3-spells')}
              testId="card-v3-spells"
              icon={Wand2}
              title="Crafted Spells"
              description="Review player-crafted V3 spells and approve a canonical name, description, and image per composition"
              hoverBorder="hover:border-violet-600"
              iconBg="bg-violet-700/20"
              iconColor="text-violet-500"
              titleColor="text-violet-500"
            />
            <DashCard
              onClick={() => onNavigate('element-requirements')}
              testId="card-element-requirements"
              icon={Lock}
              title="Element Requirements"
              description="Gate which spell elements players may craft with — require a Knowledge or item (optionally consumed) per element"
              hoverBorder="hover:border-violet-600"
              iconBg="bg-violet-700/20"
              iconColor="text-violet-500"
              titleColor="text-violet-500"
            />
          </DashSection>
        )}

        {isAdmin && (
          <DashSection title="Weapons & Techniques" icon={Sword} color="text-rose-400">
            <DashCard
              onClick={() => onNavigate('techniques')}
              testId="card-techniques"
              icon={Sword}
              title="Techniques"
              description="Define weapon techniques — energy cost, unlock requirements, and a base-damage or skill-check roll"
              hoverBorder="hover:border-rose-600"
              iconBg="bg-rose-700/20"
              iconColor="text-rose-500"
              titleColor="text-rose-500"
            />
            <DashCard
              onClick={() => onNavigate('technique-groups')}
              testId="card-technique-groups"
              icon={Layers}
              title="Weapon Techniques"
              description="Group techniques together, then assign a group to a weapon so its wielder can use them"
              hoverBorder="hover:border-rose-600"
              iconBg="bg-rose-700/20"
              iconColor="text-rose-500"
              titleColor="text-rose-500"
            />
          </DashSection>
        )}

        <DashSection title="Species & Progression" icon={Users} color="text-emerald-400">
          <DashCard
            onClick={() => onNavigate('species')}
            testId="card-system-species"
            icon={Users}
            title="System Species"
            description="Define playable races and species with their unique traits and abilities"
            hoverBorder="hover:border-emerald-600"
            iconBg="bg-emerald-700/20"
            iconColor="text-emerald-500"
            titleColor="text-emerald-500"
          />
          {isAdmin && (
            <DashCard
              onClick={() => onNavigate('feat-trees')}
              testId="card-feat-trees"
              icon={GitBranch}
              title="Skill Trees"
              description="Create and manage skill trees for species and classes"
              hoverBorder="hover:border-emerald-600"
              iconBg="bg-emerald-700/20"
              iconColor="text-emerald-500"
              titleColor="text-emerald-500"
            />
          )}
          {isAdmin && (
            <DashCard
              onClick={() => onNavigate('classes')}
              testId="card-classes"
              icon={Layers}
              title="Classes"
              description="Create and manage character classes with skill trees"
              hoverBorder="hover:border-emerald-600"
              iconBg="bg-emerald-700/20"
              iconColor="text-emerald-500"
              titleColor="text-emerald-500"
            />
          )}
        </DashSection>

        <DashSection title="Items & Templates" icon={Package} color="text-amber-400">
          <DashCard
            onClick={() => onNavigate('items')}
            testId="card-system-items"
            icon={Package}
            title="System Items"
            description="Manage weapons, armor, consumables, and other items available across all campaigns"
            hoverBorder="hover:border-amber-600"
            iconBg="bg-amber-700/20"
            iconColor="text-amber-500"
            titleColor="text-amber-500"
          />
          <DashCard
            onClick={() => onNavigate('item-templates')}
            testId="card-item-templates"
            icon={Layers}
            title="Roll Templates"
            description="Create live roll templates whose roll edits propagate to every linked item and spell, even on character sheets"
            hoverBorder="hover:border-amber-600"
            iconBg="bg-amber-700/20"
            iconColor="text-amber-500"
            titleColor="text-amber-500"
          />
          <DashCard
            onClick={() => onNavigate('crafter-recipe-templates')}
            testId="card-crafter-recipe-templates"
            icon={Hammer}
            title="Crafter Recipe Templates"
            description="Build shared recipe lists and link them to crafter items. Edits propagate to every linked crafter automatically."
            hoverBorder="hover:border-amber-600"
            iconBg="bg-amber-700/20"
            iconColor="text-amber-500"
            titleColor="text-amber-500"
          />
        </DashSection>

        {isAdmin && (
          <DashSection title="Characters & Mechanics" icon={User} color="text-cyan-400">
            <DashCard
              onClick={() => onNavigate('skills')}
              testId="card-system-skills"
              icon={BookOpen}
              title="Knowledge"
              description="Create knowledge that can be added to character sheets"
              hoverBorder="hover:border-cyan-600"
              iconBg="bg-cyan-700/20"
              iconColor="text-cyan-500"
              titleColor="text-cyan-500"
            />
            <DashCard
              onClick={() => onNavigate('traits')}
              testId="card-system-traits"
              icon={Star}
              title="Traits"
              description="Create traits with limited uses that reset on long rest"
              hoverBorder="hover:border-cyan-600"
              iconBg="bg-cyan-700/20"
              iconColor="text-cyan-500"
              titleColor="text-cyan-500"
            />
            <DashCard
              onClick={() => onNavigate('token-effects')}
              testId="card-token-effects"
              icon={Flame}
              title="Token Effects"
              description="Define status effects like poison, burning, or stun that can be applied to tokens in combat"
              hoverBorder="hover:border-cyan-600"
              iconBg="bg-cyan-700/20"
              iconColor="text-cyan-500"
              titleColor="text-cyan-500"
            />
            <DashCard
              onClick={() => onNavigate('characters')}
              testId="card-character-templates"
              icon={User}
              title="Character Templates"
              description="Create reusable character templates for quick character creation"
              hoverBorder="hover:border-cyan-600"
              iconBg="bg-cyan-700/20"
              iconColor="text-cyan-500"
              titleColor="text-cyan-500"
            />
          </DashSection>
        )}

        {isAdmin && (
          <DashSection title="Archives" icon={Archive} color="text-stone-400">
            <DashCard
              onClick={() => onNavigate('archived-items')}
              testId="card-archived-items"
              icon={Archive}
              title="Archived Items"
              description="View and restore archived items that are no longer active"
              hoverBorder="hover:border-stone-500"
              iconBg="bg-stone-700/20"
              iconColor="text-stone-400"
              titleColor="text-stone-400"
              descColor="text-stone-500"
            />
            <DashCard
              onClick={() => onNavigate('archived-spells')}
              testId="card-archived-spells"
              icon={Archive}
              title="Archived Spells"
              description="View and restore archived spells that are no longer active"
              hoverBorder="hover:border-stone-500"
              iconBg="bg-stone-700/20"
              iconColor="text-stone-400"
              titleColor="text-stone-400"
              descColor="text-stone-500"
            />
          </DashSection>
        )}
      </div>
    );
  }

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
        onClick={() => onNavigate('item-templates')}
        data-testid="card-item-templates"
      >
        <CardHeader>
          <div className="h-12 w-12 rounded-lg bg-amber-700/20 flex items-center justify-center mb-2">
            <Layers className="h-6 w-6 text-amber-500" />
          </div>
          <CardTitle className="text-amber-500">Roll Templates</CardTitle>
          <CardDescription className="text-stone-400">
            Create live roll templates whose roll edits propagate to every linked item and spell, even on character sheets
          </CardDescription>
        </CardHeader>
      </Card>

      <Card
        className="bg-stone-900 border-stone-700 cursor-pointer hover:border-amber-600 transition-colors"
        onClick={() => onNavigate('crafter-recipe-templates')}
        data-testid="card-crafter-recipe-templates"
      >
        <CardHeader>
          <div className="h-12 w-12 rounded-lg bg-amber-700/20 flex items-center justify-center mb-2">
            <Hammer className="h-6 w-6 text-amber-500" />
          </div>
          <CardTitle className="text-amber-500">Crafter Recipe Templates</CardTitle>
          <CardDescription className="text-stone-400">
            Build shared recipe lists and link them to crafter items. Edits propagate to every linked crafter automatically.
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

      {systemSlug !== 'aa-v3' && (
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
      )}

      {isAdmin && (<>
      <Card 
        className="bg-stone-900 border-stone-700 cursor-pointer hover:border-amber-600 transition-colors"
        onClick={() => onNavigate('skills')}
        data-testid="card-system-skills"
      >
        <CardHeader>
          <div className="h-12 w-12 rounded-lg bg-cyan-700/20 flex items-center justify-center mb-2">
            <BookOpen className="h-6 w-6 text-cyan-500" />
          </div>
          <CardTitle className="text-cyan-500">{systemSlug === 'aa-v3' ? 'Knowledge' : 'Custom Skills'}</CardTitle>
          <CardDescription className="text-stone-400">
            {systemSlug === 'aa-v3' ? 'Create knowledge that can be added to character sheets' : 'Create custom skills that can be added to character sheets'}
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
          <CardTitle className="text-purple-500">{isPersonalLibSystem ? 'Skill Trees' : 'Feat Trees'}</CardTitle>
          <CardDescription className="text-stone-400">
            {isPersonalLibSystem 
              ? 'Create and manage skill trees for species and classes'
              : 'Create and manage feat progression trees for characters'}
          </CardDescription>
        </CardHeader>
      </Card>

      {isPersonalLibSystem && (
        <Card 
          className="bg-stone-900 border-stone-700 cursor-pointer hover:border-fuchsia-600 transition-colors"
          onClick={() => onNavigate('classes')}
          data-testid="card-classes"
        >
          <CardHeader>
            <div className="h-12 w-12 rounded-lg bg-fuchsia-700/20 flex items-center justify-center mb-2">
              <Layers className="h-6 w-6 text-fuchsia-500" />
            </div>
            <CardTitle className="text-fuchsia-500">Classes</CardTitle>
            <CardDescription className="text-stone-400">
              Create and manage character classes with skill trees for the A.A. V2 system
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card 
        className="bg-stone-900 border-stone-700 cursor-pointer hover:border-stone-500 transition-colors"
        onClick={() => onNavigate('archived-items')}
        data-testid="card-archived-items"
      >
        <CardHeader>
          <div className="h-12 w-12 rounded-lg bg-stone-700/20 flex items-center justify-center mb-2">
            <Archive className="h-6 w-6 text-stone-400" />
          </div>
          <CardTitle className="text-stone-400">Archived Items</CardTitle>
          <CardDescription className="text-stone-500">
            View and restore archived items that are no longer active
          </CardDescription>
        </CardHeader>
      </Card>

      <Card 
        className="bg-stone-900 border-stone-700 cursor-pointer hover:border-stone-500 transition-colors"
        onClick={() => onNavigate('archived-spells')}
        data-testid="card-archived-spells"
      >
        <CardHeader>
          <div className="h-12 w-12 rounded-lg bg-stone-700/20 flex items-center justify-center mb-2">
            <Archive className="h-6 w-6 text-stone-400" />
          </div>
          <CardTitle className="text-stone-400">Archived Spells</CardTitle>
          <CardDescription className="text-stone-500">
            View and restore archived spells that are no longer active
          </CardDescription>
        </CardHeader>
      </Card>

      </>)}

    </div>
  );
}

interface AdminNotification {
  id: string;
  title: string;
  message: string;
  patchNotes: string | null;
  createdBy: string;
  createdAt: string;
}

function NotificationsView() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [patchNotes, setPatchNotes] = useState('');
  const [showPatchNotes, setShowPatchNotes] = useState(false);

  const { data: notifications = [], isLoading } = useQuery<AdminNotification[]>({
    queryKey: ['/api/admin/notifications'],
    queryFn: async () => {
      const res = await fetch('/api/admin/notifications', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch notifications');
      return res.json();
    },
  });

  const sendNotificationMutation = useMutation({
    mutationFn: async (data: { title: string; message: string; patchNotes?: string }) => {
      const res = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to send notification');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/notifications'] });
      setTitle('');
      setMessage('');
      setPatchNotes('');
      setShowPatchNotes(false);
      toast({ title: 'Notification Sent', description: 'Notification has been broadcast to all active users' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to send notification', variant: 'destructive' });
    },
  });

  const handleSend = () => {
    if (!title.trim() || !message.trim()) {
      toast({ title: 'Error', description: 'Title and message are required', variant: 'destructive' });
      return;
    }
    sendNotificationMutation.mutate({
      title: title.trim(),
      message: message.trim(),
      patchNotes: patchNotes.trim() || undefined,
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="bg-stone-900 border-stone-700">
        <CardHeader>
          <CardTitle className="text-orange-500 flex items-center gap-2">
            <Send className="h-5 w-5" />
            Send Notification
          </CardTitle>
          <CardDescription className="text-stone-400">
            Broadcast a notification to all users currently in an active campaign session
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <Label htmlFor="notif-title" className="text-stone-300">Title</Label>
            <Input
              id="notif-title"
              placeholder="Notification title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-stone-800 border-stone-700 mt-1"
              data-testid="input-notification-title"
            />
          </div>
          <div>
            <Label htmlFor="notif-message" className="text-stone-300">Message</Label>
            <Textarea
              id="notif-message"
              placeholder="Notification message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="bg-stone-800 border-stone-700 mt-1 min-h-[100px]"
              data-testid="input-notification-message"
            />
          </div>
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPatchNotes(!showPatchNotes)}
              className="text-stone-400 hover:text-stone-200 p-0 h-auto"
              data-testid="button-toggle-patch-notes"
            >
              {showPatchNotes ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
              {showPatchNotes ? 'Hide' : 'Add'} Patch Notes (optional)
            </Button>
            {showPatchNotes && (
              <Textarea
                id="notif-patchnotes"
                placeholder="Patch notes or changelog..."
                value={patchNotes}
                onChange={(e) => setPatchNotes(e.target.value)}
                className="bg-stone-800 border-stone-700 mt-2 min-h-[120px]"
                data-testid="input-notification-patchnotes"
              />
            )}
          </div>
          <Button
            onClick={handleSend}
            disabled={sendNotificationMutation.isPending || !title.trim() || !message.trim()}
            className="bg-orange-700 hover:bg-orange-600 w-fit"
            data-testid="button-send-notification"
          >
            {sendNotificationMutation.isPending ? (
              <>Sending...</>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send Notification
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-stone-900 border-stone-700">
        <CardHeader>
          <CardTitle className="text-stone-300 flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-stone-500 text-center py-8">Loading...</div>
          ) : notifications.length === 0 ? (
            <div className="text-stone-500 text-center py-8">No notifications sent yet</div>
          ) : (
            <div className="flex flex-col gap-3">
              {notifications.map((notif) => (
                <div key={notif.id} className="bg-stone-800 rounded-lg p-4 border border-stone-700">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h4 className="font-semibold text-orange-400">{notif.title}</h4>
                      <p className="text-stone-300 mt-1 whitespace-pre-wrap">{notif.message}</p>
                      {notif.patchNotes && (
                        <div className="mt-2 p-2 bg-stone-900 rounded text-stone-400 text-sm whitespace-pre-wrap">
                          <span className="text-stone-500 text-xs uppercase tracking-wide">Patch Notes:</span>
                          <div className="mt-1">{notif.patchNotes}</div>
                        </div>
                      )}
                    </div>
                    <div className="text-stone-500 text-xs shrink-0">
                      {new Date(notif.createdAt).toLocaleDateString()} {new Date(notif.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface ItemsViewProps {
  items: any[];
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  typeFilter: string;
  setTypeFilter: (t: string) => void;
  onAddItem: () => void;
  onEditItem: (itemId: string) => void;
  onDeleteItem: (id: string) => void;
  onDuplicateItem: (itemId: string) => void;
  onArchiveItem: (id: string) => void;
  onCopyToSystem?: (id: string) => void;
  copyTargetLabel?: string;
}

function ItemsView({ items, isLoading, searchQuery, setSearchQuery, typeFilter, setTypeFilter, onAddItem, onEditItem, onDeleteItem, onDuplicateItem, onArchiveItem, onCopyToSystem, copyTargetLabel }: ItemsViewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  
  const toggleAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i: any) => i.id)));
    }
  };

  const bulkArchiveMutation = useMutation({
    mutationFn: (ids: string[]) => api.bulkArchiveItems(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-items-summary'] });
      queryClient.invalidateQueries({ queryKey: ['system-items'] });
      queryClient.invalidateQueries({ queryKey: ['admin-archived-items'] });
      setSelectedIds(new Set());
      toast({ title: `${selectedIds.size} items archived` });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.bulkDeleteItems(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-items-summary'] });
      queryClient.invalidateQueries({ queryKey: ['system-items'] });
      setSelectedIds(new Set());
      toast({ title: `Items deleted` });
    },
  });

  const allSelected = items.length > 0 && selectedIds.size === items.length;
  const someSelected = selectedIds.size > 0;

  return (
    <Card className="bg-stone-900 border-stone-700 flex-1 flex flex-col min-h-0">
      <CardHeader className="flex flex-row items-center justify-between shrink-0">
        <CardTitle className="text-amber-500">System Items</CardTitle>
        <div className="flex gap-2">
          <Button onClick={onAddItem} className="bg-amber-700 hover:bg-amber-600" data-testid="button-add-system-item">
            <Plus className="h-4 w-4 mr-2" /> Add Item
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0">
        <div className="flex gap-4 mb-4 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
            <Input placeholder="Search items..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 bg-stone-800 border-stone-700" data-testid="input-search-items" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px] bg-stone-800 border-stone-700" data-testid="select-type-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="weapon">Weapons</SelectItem>
              <SelectItem value="ammunition">Ammunition</SelectItem>
              <SelectItem value="armor">Armor</SelectItem>
              <SelectItem value="consumable">Consumables</SelectItem>
              <SelectItem value="utility">Utilities</SelectItem>
              <SelectItem value="container">Containers</SelectItem>
              <SelectItem value="currency">Currency</SelectItem>
              <SelectItem value="spellbook">Spellbooks</SelectItem>
              <SelectItem value="scroll">Scrolls</SelectItem>
              <SelectItem value="rune">Runes</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {items.length > 0 && (
          <div className="flex items-center gap-3 mb-3 shrink-0">
            <button onClick={toggleAll} className="flex items-center gap-2 text-xs text-stone-400 hover:text-stone-200 transition-colors" data-testid="button-select-all-items">
              {allSelected ? <CheckSquare className="h-4 w-4 text-amber-400" /> : <Square className="h-4 w-4" />}
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
            {someSelected && <span className="text-xs text-amber-400">{selectedIds.size} selected</span>}
          </div>
        )}

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
              {items.map((item: any) => (
                <div
                  key={item.id}
                  className={`flex flex-wrap items-center gap-2 sm:gap-4 p-3 rounded-lg bg-stone-800 border ${selectedIds.has(item.id) ? 'border-amber-500/50 bg-amber-900/10' : 'border-stone-700 hover:border-stone-600'}`}
                  data-testid={`item-row-${item.id}`}
                >
                  <button onClick={() => toggleSelect(item.id)} className="shrink-0" data-testid={`checkbox-item-${item.id}`}>
                    {selectedIds.has(item.id) ? <CheckSquare className="h-5 w-5 text-amber-400" /> : <Square className="h-5 w-5 text-stone-500 hover:text-stone-300" />}
                  </button>
                  <LazyAdminItemImage itemId={item.id} itemType={item.itemType} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate text-sm sm:text-base">{item.name}</span>
                      <Badge className={`${rarityColors[item.rarity]} text-xs`}>{item.rarity}</Badge>
                    </div>
                    <div className="text-xs sm:text-sm text-stone-400 flex items-center gap-2">
                      <span className="capitalize">{item.itemType}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 sm:gap-2 shrink-0 w-full sm:w-auto justify-start sm:justify-end">
                    <Button variant="ghost" size="icon" onClick={() => onEditItem(item.id)} className="text-stone-400 hover:text-amber-500 h-8 w-8 sm:h-10 sm:w-10" data-testid={`button-edit-${item.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {onCopyToSystem && (
                      <Button variant="ghost" size="icon" onClick={() => onCopyToSystem(item.id)} className="text-stone-400 hover:text-green-500 h-8 w-8 sm:h-10 sm:w-10" data-testid={`button-copy-system-${item.id}`} title={`Copy to ${copyTargetLabel || 'other system'}`}>
                        <Send className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => onDuplicateItem(item.id)} className="text-stone-400 hover:text-blue-500 h-8 w-8 sm:h-10 sm:w-10" data-testid={`button-duplicate-${item.id}`} title="Duplicate item">
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onArchiveItem(item.id)} className="text-stone-400 hover:text-stone-300 h-8 w-8 sm:h-10 sm:w-10" data-testid={`button-archive-${item.id}`} title="Archive item">
                      <Archive className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onDeleteItem(item.id)} className="text-stone-400 hover:text-red-500 h-8 w-8 sm:h-10 sm:w-10" data-testid={`button-delete-${item.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {someSelected && (
          <div className="shrink-0 mt-3 flex items-center gap-2 p-3 bg-stone-800 border border-stone-600 rounded-lg">
            <span className="text-xs text-stone-300 mr-auto">{selectedIds.size} selected</span>
            <Button size="sm" variant="outline" className="h-7 text-xs border-stone-600 text-stone-300 hover:text-stone-100" onClick={() => { if (confirm(`Archive ${selectedIds.size} items?`)) bulkArchiveMutation.mutate(Array.from(selectedIds)); }} disabled={bulkArchiveMutation.isPending} data-testid="button-bulk-archive-items">
              <Archive className="h-3 w-3 mr-1" /> Archive
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs border-red-800 text-red-400 hover:text-red-300 hover:bg-red-900/30" onClick={() => { if (confirm(`Permanently delete ${selectedIds.size} items?`)) bulkDeleteMutation.mutate(Array.from(selectedIds)); }} disabled={bulkDeleteMutation.isPending} data-testid="button-bulk-delete-items">
              <Trash2 className="h-3 w-3 mr-1" /> Delete
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-stone-500" onClick={() => setSelectedIds(new Set())} data-testid="button-clear-selection-items">
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ItemTemplatesViewProps {
  templates: any[];
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onAddTemplate: () => void;
  onEditTemplate: (id: string) => void;
  onDeleteTemplate: (id: string) => void;
  onDuplicateTemplate: (id: string) => void;
  onBulkDeleteTemplates: (ids: string[]) => void;
  bulkDeletePending: boolean;
  duplicatingTemplateId: string | null;
}

function ItemTemplatesView({ templates, isLoading, searchQuery, setSearchQuery, onAddTemplate, onEditTemplate, onDeleteTemplate, onDuplicateTemplate, onBulkDeleteTemplates, bulkDeletePending, duplicatingTemplateId }: ItemTemplatesViewProps) {
  const filtered = templates.filter((t: any) => {
    return !searchQuery || t.name?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (filtered.length > 0 && selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((t: any) => t.id)));
    }
  };

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  const someSelected = selectedIds.size > 0;

  return (
    <Card className="bg-stone-900 border-stone-700 flex-1 flex flex-col min-h-0">
      <CardHeader className="flex flex-row items-center justify-between shrink-0">
        <div>
          <CardTitle className="text-amber-500">Roll Templates</CardTitle>
          <CardDescription className="text-stone-400 mt-1">
            Edits to a template's rolls propagate live to every linked item and spell, including character-owned copies.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button onClick={onAddTemplate} className="bg-amber-700 hover:bg-amber-600" data-testid="button-add-item-template">
            <Plus className="h-4 w-4 mr-2" /> Add Template
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0">
        <div className="mb-4 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
            <Input placeholder="Search templates..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 bg-stone-800 border-stone-700" data-testid="input-search-templates" />
          </div>
        </div>

        {filtered.length > 0 && (
          <div className="flex items-center gap-3 mb-3 shrink-0">
            <button onClick={toggleAll} className="flex items-center gap-2 text-xs text-stone-400 hover:text-stone-200 transition-colors" data-testid="button-select-all-templates">
              {allSelected ? <CheckSquare className="h-4 w-4 text-amber-400" /> : <Square className="h-4 w-4" />}
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
            {someSelected && <span className="text-xs text-amber-400" data-testid="text-templates-selected-count">{selectedIds.size} selected</span>}
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12 text-stone-400">Loading templates...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-stone-400">
            <Layers className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-bold">No item roll templates yet</p>
            <p className="text-sm mt-2">Create a template, then assign items to it from any item's settings.</p>
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-2">
              {filtered.map((template: any) => (
                <div
                  key={template.id}
                  className={`flex flex-wrap items-center gap-2 sm:gap-4 p-3 rounded-lg bg-stone-800 border ${selectedIds.has(template.id) ? 'border-amber-500/50 bg-amber-900/10' : 'border-stone-700 hover:border-stone-600'}`}
                  data-testid={`template-row-${template.id}`}
                >
                  <button onClick={() => toggleSelect(template.id)} className="shrink-0" data-testid={`checkbox-template-${template.id}`}>
                    {selectedIds.has(template.id) ? <CheckSquare className="h-5 w-5 text-amber-400" /> : <Square className="h-5 w-5 text-stone-500 hover:text-stone-300" />}
                  </button>
                  <LazyAdminItemImage itemId={template.id} itemType={template.itemType} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate text-sm sm:text-base" data-testid={`text-template-name-${template.id}`}>{template.name}</span>
                      <Badge className={`${rarityColors[template.rarity] || 'bg-stone-600'} text-xs`}>{template.rarity}</Badge>
                      <Badge className="bg-amber-700/30 text-amber-300 text-xs border border-amber-700/50">Live Template</Badge>
                    </div>
                    <div className="text-xs sm:text-sm text-stone-400 flex items-center gap-2">
                      <span className="capitalize">{template.itemType}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 sm:gap-2 shrink-0 w-full sm:w-auto justify-start sm:justify-end">
                    <Button variant="ghost" size="icon" onClick={() => onEditTemplate(template.id)} className="text-stone-400 hover:text-amber-500 h-8 w-8 sm:h-10 sm:w-10" data-testid={`button-edit-template-${template.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDuplicateTemplate(template.id)}
                      disabled={duplicatingTemplateId === template.id}
                      className="text-stone-400 hover:text-amber-500 h-8 w-8 sm:h-10 sm:w-10"
                      title="Duplicate template"
                      data-testid={`button-duplicate-template-${template.id}`}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onDeleteTemplate(template.id)} className="text-stone-400 hover:text-red-500 h-8 w-8 sm:h-10 sm:w-10" data-testid={`button-delete-template-${template.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {someSelected && (
          <div className="shrink-0 mt-3 flex items-center gap-2 p-3 bg-stone-800 border border-stone-600 rounded-lg">
            <span className="text-xs text-stone-300 mr-auto">{selectedIds.size} selected</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-red-800 text-red-400 hover:text-red-300 hover:bg-red-900/30"
              onClick={() => {
                if (confirm(`Permanently delete ${selectedIds.size} roll templates? Linked items and spells will be unlinked but preserved.`)) {
                  onBulkDeleteTemplates(Array.from(selectedIds));
                  setSelectedIds(new Set());
                }
              }}
              disabled={bulkDeletePending}
              data-testid="button-bulk-delete-templates"
            >
              <Trash2 className="h-3 w-3 mr-1" /> Delete
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-stone-500" onClick={() => setSelectedIds(new Set())} data-testid="button-clear-selection-templates">
              <X className="h-3 w-3" />
            </Button>
          </div>
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
                  className="flex flex-wrap items-center gap-2 sm:gap-4 p-3 rounded-lg bg-stone-800 border border-stone-700 hover:border-stone-600"
                  data-testid={`species-row-${s.id}`}
                >
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded bg-stone-700 flex items-center justify-center shrink-0">
                    <Users className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate text-sm sm:text-base">{s.name}</span>
                      <Badge className="bg-stone-600 text-xs">{s.size}</Badge>
                    </div>
                    <div className="text-xs sm:text-sm text-stone-400 flex flex-wrap gap-1 sm:gap-2">
                      <span>HP: {s.startingHp}</span>
                      <span>| Speed: {s.speed}ft</span>
                      {s.flySpeed > 0 && <span>| Fly: {s.flySpeed}ft</span>}
                      <span>| Armor: {s.naturalArmor}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 sm:gap-2 shrink-0 w-full sm:w-auto justify-start sm:justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEditSpecies(s)}
                      className="text-stone-400 hover:text-emerald-500 h-8 w-8 sm:h-10 sm:w-10"
                      data-testid={`button-edit-species-${s.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDeleteSpecies(s.id)}
                      className="text-stone-400 hover:text-red-500 h-8 w-8 sm:h-10 sm:w-10"
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
  onDuplicateSpell: (id: string) => void;
  onArchiveSpell: (id: string) => void;
  onCopyToSystem?: (id: string) => void;
  copyTargetLabel?: string;
}


function SpellsView({ spells, isLoading, searchQuery, setSearchQuery, onAddSpell, onEditSpell, onDeleteSpell, onDuplicateSpell, onArchiveSpell, onCopyToSystem, copyTargetLabel }: SpellsViewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  
  const toggleAll = () => {
    if (selectedIds.size === spells.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(spells.map(s => s.id)));
    }
  };

  const bulkArchiveMutation = useMutation({
    mutationFn: (ids: string[]) => api.bulkArchiveSpells(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-spells'] });
      queryClient.invalidateQueries({ queryKey: ['admin-archived-spells'] });
      setSelectedIds(new Set());
      toast({ title: `${selectedIds.size} spells archived` });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.bulkDeleteSpells(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-spells'] });
      setSelectedIds(new Set());
      toast({ title: `Spells deleted` });
    },
  });

  const allSelected = spells.length > 0 && selectedIds.size === spells.length;
  const someSelected = selectedIds.size > 0;

  return (
    <Card className="bg-stone-900 border-stone-700 flex-1 flex flex-col min-h-0">
      <CardHeader className="flex flex-row items-center justify-between shrink-0">
        <CardTitle className="text-blue-500">System Spells</CardTitle>
        <div className="flex gap-2">
          <Button onClick={onAddSpell} className="bg-blue-700 hover:bg-blue-600" data-testid="button-add-spell">
            <Plus className="h-4 w-4 mr-2" /> Add Spell
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0">
        <div className="mb-4 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
            <Input placeholder="Search spells..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 bg-stone-800 border-stone-700" data-testid="input-search-spells" />
          </div>
        </div>

        {spells.length > 0 && (
          <div className="flex items-center gap-3 mb-3 shrink-0">
            <button onClick={toggleAll} className="flex items-center gap-2 text-xs text-stone-400 hover:text-stone-200 transition-colors" data-testid="button-select-all-spells">
              {allSelected ? <CheckSquare className="h-4 w-4 text-blue-400" /> : <Square className="h-4 w-4" />}
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
            {someSelected && <span className="text-xs text-blue-400">{selectedIds.size} selected</span>}
          </div>
        )}

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
                  className={`flex flex-wrap items-center gap-2 sm:gap-4 p-3 rounded-lg bg-stone-800 border ${selectedIds.has(spell.id) ? 'border-blue-500/50 bg-blue-900/10' : 'border-stone-700 hover:border-stone-600'}`}
                  data-testid={`spell-row-${spell.id}`}
                >
                  <button onClick={() => toggleSelect(spell.id)} className="shrink-0" data-testid={`checkbox-spell-${spell.id}`}>
                    {selectedIds.has(spell.id) ? <CheckSquare className="h-5 w-5 text-blue-400" /> : <Square className="h-5 w-5 text-stone-500 hover:text-stone-300" />}
                  </button>
                  <LazyAdminSpellIcon spellId={spell.id} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate text-sm sm:text-base">{spell.name}</span>
                      <Badge className={spell.castingTime?.toLowerCase().includes('bonus') ? 'bg-blue-600 text-xs' : 'bg-red-600 text-xs'}>
                        {spell.castingTime?.toLowerCase().includes('bonus') ? 'Bonus Action' : 'Action'}
                      </Badge>
                    </div>
                    <div className="text-xs sm:text-sm text-stone-400 flex flex-wrap gap-1 sm:gap-2">
                      <span>Range: {spell.range}</span>
                      <span>| {spell.duration}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 sm:gap-2 shrink-0 w-full sm:w-auto justify-start sm:justify-end">
                    <Button variant="ghost" size="icon" onClick={() => onEditSpell(spell)} className="text-stone-400 hover:text-blue-500 h-8 w-8 sm:h-10 sm:w-10" data-testid={`button-edit-spell-${spell.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {onCopyToSystem && (
                      <Button variant="ghost" size="icon" onClick={() => onCopyToSystem(spell.id)} className="text-stone-400 hover:text-green-500 h-8 w-8 sm:h-10 sm:w-10" data-testid={`button-copy-spell-${spell.id}`} title={`Copy to ${copyTargetLabel || 'other system'}`}>
                        <Send className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => onDuplicateSpell(spell.id)} className="text-stone-400 hover:text-blue-500 h-8 w-8 sm:h-10 sm:w-10" data-testid={`button-duplicate-spell-${spell.id}`} title="Duplicate spell">
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onArchiveSpell(spell.id)} className="text-stone-400 hover:text-stone-300 h-8 w-8 sm:h-10 sm:w-10" data-testid={`button-archive-spell-${spell.id}`} title="Archive spell">
                      <Archive className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onDeleteSpell(spell.id)} className="text-stone-400 hover:text-red-500 h-8 w-8 sm:h-10 sm:w-10" data-testid={`button-delete-spell-${spell.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {someSelected && (
          <div className="shrink-0 mt-3 flex items-center gap-2 p-3 bg-stone-800 border border-stone-600 rounded-lg">
            <span className="text-xs text-stone-300 mr-auto">{selectedIds.size} selected</span>
            <Button size="sm" variant="outline" className="h-7 text-xs border-stone-600 text-stone-300 hover:text-stone-100" onClick={() => { if (confirm(`Archive ${selectedIds.size} spells?`)) bulkArchiveMutation.mutate(Array.from(selectedIds)); }} disabled={bulkArchiveMutation.isPending} data-testid="button-bulk-archive-spells">
              <Archive className="h-3 w-3 mr-1" /> Archive
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs border-red-800 text-red-400 hover:text-red-300 hover:bg-red-900/30" onClick={() => { if (confirm(`Permanently delete ${selectedIds.size} spells?`)) bulkDeleteMutation.mutate(Array.from(selectedIds)); }} disabled={bulkDeleteMutation.isPending} data-testid="button-bulk-delete-spells">
              <Trash2 className="h-3 w-3 mr-1" /> Delete
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-stone-500" onClick={() => setSelectedIds(new Set())} data-testid="button-clear-selection-spells">
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface SkillsViewProps {
  skills: SystemSkill[];
  systemSlug: string;
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

function SkillsView({ skills, systemSlug, isLoading, searchQuery, setSearchQuery, onAddSkill, onEditSkill, onDeleteSkill }: SkillsViewProps) {
  const isV3 = systemSlug === 'aa-v3';
  return (
    <Card className="bg-stone-900 border-stone-700 flex-1 flex flex-col min-h-0">
      <CardHeader className="flex flex-row items-center justify-between shrink-0">
        <CardTitle className="text-cyan-500">{isV3 ? 'Knowledge' : 'Custom Skills'}</CardTitle>
        <Button
          onClick={onAddSkill}
          className="bg-cyan-700 hover:bg-cyan-600"
          data-testid="button-add-skill"
        >
          <Plus className="h-4 w-4 mr-2" />
          {isV3 ? 'Add Knowledge' : 'Add Skill'}
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
            <p className="font-bold">{isV3 ? 'No knowledge found' : 'No custom skills found'}</p>
            <p className="text-sm mt-2">{isV3 ? 'Create knowledge that can be added to character sheets' : 'Create custom skills that can be added to character sheets'}</p>
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-2">
              {skills.map((skill: SystemSkill) => (
                <div
                  key={skill.id}
                  className="flex flex-wrap items-center gap-2 sm:gap-4 p-3 rounded-lg bg-stone-800 border border-stone-700 hover:border-stone-600"
                  data-testid={`skill-row-${skill.id}`}
                >
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded bg-stone-700 flex items-center justify-center overflow-hidden shrink-0">
                    <BookOpen className="h-5 w-5 sm:h-6 sm:w-6 text-cyan-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate text-sm sm:text-base">{skill.name}</span>
                      <Badge className={`bg-stone-700 ${parentAttributeColors[skill.parentAttribute] || 'text-stone-300'} text-xs`}>
                        {skill.parentAttribute.charAt(0).toUpperCase() + skill.parentAttribute.slice(1)}
                      </Badge>
                    </div>
                    {skill.description && (
                      <div className="text-xs sm:text-sm text-stone-400 truncate">
                        {skill.description}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 sm:gap-2 shrink-0 w-full sm:w-auto justify-start sm:justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEditSkill(skill)}
                      className="text-stone-400 hover:text-cyan-500 h-8 w-8 sm:h-10 sm:w-10"
                      data-testid={`button-edit-skill-${skill.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDeleteSkill(skill.id)}
                      className="text-stone-400 hover:text-red-500 h-8 w-8 sm:h-10 sm:w-10"
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
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                      <Star className="h-4 w-4 sm:h-5 sm:w-5 text-rose-400 shrink-0" />
                      <span className="font-medium truncate text-sm sm:text-base">{trait.name}</span>
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
                        className="h-8 w-8 sm:h-10 sm:w-10 text-stone-400 hover:text-rose-500"
                        data-testid={`button-edit-trait-${trait.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDeleteTrait(trait.id)}
                        className="h-8 w-8 sm:h-10 sm:w-10 text-stone-400 hover:text-red-500"
                        data-testid={`button-delete-trait-${trait.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {trait.description && (
                    <div className="text-xs sm:text-sm text-stone-400 mt-1 line-clamp-2">
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
  systemSlug?: string;
}

function TraitFormDialog({ open, onOpenChange, onSave, initialData, isLoading, systemSlug }: TraitFormDialogProps) {
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
                <Label className="text-stone-300">{getEffectTypeLabel(systemSlug)}</Label>
                <Select
                  value={formData.damageModifierDamageType}
                  onValueChange={(value) => setFormData({ ...formData, damageModifierDamageType: value })}
                >
                  <SelectTrigger className="bg-stone-800 border-stone-700 mt-1" data-testid="select-damage-modifier-damage-type">
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {getEffectTypes(systemSlug).map((type) => (
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
                  className="flex flex-wrap items-center gap-2 sm:gap-4 p-3 rounded-lg bg-stone-800 border border-stone-700 hover:border-stone-600"
                  data-testid={`effect-row-${effect.id}`}
                >
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded bg-stone-700 flex items-center justify-center overflow-hidden shrink-0">
                    {effect.imageUrl ? (
                      <img src={effect.imageUrl} alt={effect.name} className="h-full w-full object-cover" />
                    ) : (
                      <Flame className="h-5 w-5 sm:h-6 sm:w-6 text-violet-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate text-sm sm:text-base">{effect.name}</span>
                      <Badge className={effect.timing === 'start_of_round' ? 'bg-blue-600 text-xs' : 'bg-orange-600 text-xs'}>
                        {effect.timing === 'start_of_round' ? 'Start of Round' : 'Start of Turn'}
                      </Badge>
                    </div>
                    <div className="text-xs sm:text-sm text-stone-400 flex flex-wrap gap-1 sm:gap-2">
                      {effect.causesDamage && effect.diceAmount && (
                        <span>Damage: {effect.diceAmount} {effect.damageType}</span>
                      )}
                      {effect.description && (
                        <span className="truncate">{effect.description}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 sm:gap-2 shrink-0 w-full sm:w-auto justify-start sm:justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEditEffect(effect)}
                      className="text-stone-400 hover:text-violet-500 h-8 w-8 sm:h-10 sm:w-10"
                      data-testid={`button-edit-effect-${effect.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDeleteEffect(effect.id)}
                      className="text-stone-400 hover:text-red-500 h-8 w-8 sm:h-10 sm:w-10"
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
  systemSlug?: string;
}

function TokenEffectFormDialog({ open, onOpenChange, onSave, initialData, isLoading, systemSlug }: TokenEffectFormDialogProps) {
  const [formData, setFormData] = useState<{
    name: string;
    imageUrl: string;
    description: string;
    timing: string;
    causesDamage: boolean;
    damageType: string;
    diceAmount: string;
    hasDuration: boolean;
    defaultDuration: number;
    durationType: string;
  }>({
    name: initialData?.name || '',
    imageUrl: initialData?.imageUrl || '',
    description: initialData?.description || '',
    timing: initialData?.timing || 'start_of_turn',
    causesDamage: initialData?.causesDamage || false,
    damageType: initialData?.damageType || '',
    diceAmount: initialData?.diceAmount || '',
    hasDuration: initialData?.hasDuration || false,
    defaultDuration: initialData?.defaultDuration || 3,
    durationType: initialData?.durationType || 'turns',
  });

  const [showImageBrowser, setShowImageBrowser] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setFormData({ ...formData, imageUrl: event.target?.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

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
        hasDuration: initialData.hasDuration || false,
        defaultDuration: initialData.defaultDuration || 3,
        durationType: initialData.durationType || 'turns',
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
        hasDuration: false,
        defaultDuration: 3,
        durationType: 'turns',
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
      hasDuration: formData.hasDuration,
      defaultDuration: formData.hasDuration ? formData.defaultDuration : null,
      durationType: formData.hasDuration ? formData.durationType : null,
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
              <Label className="text-stone-300">Effect Image</Label>
              <div className="flex items-center gap-3 mt-2">
                {formData.imageUrl ? (
                  <div className="relative">
                    <img src={formData.imageUrl} alt="Effect" className="h-16 w-16 rounded object-cover border border-stone-700" />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6 bg-red-600 hover:bg-red-500 rounded-full"
                      onClick={() => setFormData({ ...formData, imageUrl: '' })}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="h-16 w-16 rounded bg-stone-800 border border-stone-700 flex items-center justify-center">
                    <ImageIcon className="h-6 w-6 text-stone-500" />
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <input
                    type="file"
                    ref={imageInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => imageInputRef.current?.click()}
                    className="border-stone-700"
                    data-testid="button-upload-image"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowImageBrowser(true)}
                    className="border-stone-700"
                    data-testid="button-browse-image"
                  >
                    <Library className="h-4 w-4 mr-2" />
                    Browse
                  </Button>
                </div>
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
                  <Label className="text-stone-300">{getEffectTypeLabel(systemSlug)}</Label>
                  <Select
                    value={formData.damageType}
                    onValueChange={(value) => setFormData({ ...formData, damageType: value })}
                  >
                    <SelectTrigger className="bg-stone-800 border-stone-700 mt-1" data-testid="select-damage-type">
                      <SelectValue placeholder="Select type..." />
                    </SelectTrigger>
                    <SelectContent>
                      {getEffectTypes(systemSlug).map((type) => (
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

            <div className="flex items-center gap-2">
              <Checkbox
                id="hasDuration"
                checked={formData.hasDuration}
                onCheckedChange={(checked) => setFormData({ ...formData, hasDuration: !!checked })}
                data-testid="checkbox-has-duration"
              />
              <Label htmlFor="hasDuration" className="text-stone-300 cursor-pointer">
                Has Duration (auto-expires)
              </Label>
            </div>

            {formData.hasDuration && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-stone-300">Duration</Label>
                    <Input
                      type="number"
                      min="1"
                      value={formData.defaultDuration}
                      onChange={(e) => setFormData({ ...formData, defaultDuration: parseInt(e.target.value) || 1 })}
                      placeholder="Number"
                      className="bg-stone-800 border-stone-700 mt-1"
                      data-testid="input-default-duration"
                    />
                  </div>
                  <div>
                    <Label className="text-stone-300">Expires After</Label>
                    <Select
                      value={formData.durationType}
                      onValueChange={(value) => setFormData({ ...formData, durationType: value })}
                    >
                      <SelectTrigger className="bg-stone-800 border-stone-700 mt-1" data-testid="select-duration-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="turns">Turns</SelectItem>
                        <SelectItem value="rounds">Rounds</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-stone-500">
                  {formData.durationType === 'rounds' 
                    ? 'Decreases at the start of each combat round (when initiative resets to first)'
                    : 'Decreases at the start of the affected character\'s turn'}
                </p>
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
  folders: CharacterTemplateFolder[];
  expandedFolders: Set<string>;
  toggleFolder: (folderId: string) => void;
  newFolderName: string;
  setNewFolderName: (name: string) => void;
  onCreateFolder: (name: string) => void;
  isCreatingFolder: boolean;
  editingFolderId: string | null;
  setEditingFolderId: (id: string | null) => void;
  editingFolderName: string;
  setEditingFolderName: (name: string) => void;
  onUpdateFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  draggingTemplateId: string | null;
  setDraggingTemplateId: (id: string | null) => void;
  onMoveTemplateToFolder: (templateId: string, folderId: string | null) => void;
}

function CharactersView({ 
  characters, isLoading, searchQuery, setSearchQuery, onAddCharacter, onEditCharacter, onDeleteCharacter, onViewSheet,
  folders, expandedFolders, toggleFolder, newFolderName, setNewFolderName, onCreateFolder, isCreatingFolder,
  editingFolderId, setEditingFolderId, editingFolderName, setEditingFolderName, onUpdateFolder, onDeleteFolder,
  draggingTemplateId, setDraggingTemplateId, onMoveTemplateToFolder
}: CharactersViewProps) {
  const getTemplatesInFolder = (folderId: string) => 
    characters.filter((c: Character) => c.folderId === folderId);
  const unfiledTemplates = characters.filter((c: Character) => !c.folderId);

  const renderCharacterCard = (character: Character) => (
    <div
      key={character.id}
      className="p-4 rounded-lg bg-stone-800 border border-stone-700 hover:border-teal-600 transition-colors cursor-pointer"
      data-testid={`character-card-${character.id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', character.id);
        setDraggingTemplateId(character.id);
      }}
      onDragEnd={() => setDraggingTemplateId(null)}
      onClick={() => onViewSheet(character)}
    >
      <div className="flex items-start gap-3">
        <GripVertical className="h-4 w-4 text-stone-500 cursor-grab shrink-0 mt-1" />
        {character.portrait ? (
          <img src={character.portrait} alt={character.name} className="h-14 w-14 rounded-lg object-cover" />
        ) : (
          <div className="h-14 w-14 rounded-lg bg-stone-700 flex items-center justify-center">
            <User className="h-7 w-7 text-teal-400" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-stone-200 truncate">{character.name}</h3>
          <p className="text-sm text-stone-400">Level {character.level || 1}</p>
          <p className="text-sm text-teal-400">{character.race || 'Unknown Race'}</p>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2 mt-3 pt-3 border-t border-stone-700">
        <Select
          value={character.folderId || '_unfiled'}
          onValueChange={(value) => {
            onMoveTemplateToFolder(character.id, value === '_unfiled' ? null : value);
          }}
        >
          <SelectTrigger 
            className="h-8 w-[120px] bg-stone-700 border-stone-600 text-xs"
            onClick={(e) => e.stopPropagation()}
            data-testid={`select-folder-${character.id}`}
          >
            <Folder className="h-3 w-3 mr-1" />
            <SelectValue placeholder="Move to..." />
          </SelectTrigger>
          <SelectContent onClick={(e) => e.stopPropagation()}>
            <SelectItem value="_unfiled">Unfiled</SelectItem>
            {folders.map((folder) => (
              <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => { e.stopPropagation(); onViewSheet(character); }}
          className="text-stone-400 hover:text-teal-500"
          data-testid={`button-view-sheet-${character.id}`}
        >
          <User className="h-4 w-4 mr-1" />
          Open
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => { e.stopPropagation(); onEditCharacter(character); }}
          className="text-stone-400 hover:text-stone-300"
          data-testid={`button-edit-character-${character.id}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => { e.stopPropagation(); onDeleteCharacter(character.id); }}
          className="text-stone-400 hover:text-red-500"
          data-testid={`button-delete-character-${character.id}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

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
        <div className="mb-4 shrink-0 space-y-3">
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
          <div className="flex gap-2">
            <Input
              placeholder="New folder name..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="flex-1 bg-stone-800 border-stone-700 text-stone-200"
              onKeyPress={(e) => e.key === 'Enter' && newFolderName.trim() && onCreateFolder(newFolderName.trim())}
              data-testid="input-new-template-folder-name"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => newFolderName.trim() && onCreateFolder(newFolderName.trim())}
              disabled={!newFolderName.trim() || isCreatingFolder}
              className="bg-stone-800 hover:bg-stone-700"
              data-testid="button-create-template-folder"
            >
              <FolderPlus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-stone-400">Loading characters...</div>
        ) : characters.length === 0 && folders.length === 0 ? (
          <div className="text-center py-12 text-stone-400">
            <User className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-bold">No character templates found</p>
            <p className="text-sm mt-2">Create reusable character templates for quick character creation</p>
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-4 pr-2">
              {folders.map((folder: CharacterTemplateFolder) => {
                const folderTemplates = getTemplatesInFolder(folder.id);
                const isExpanded = expandedFolders.has(folder.id);
                
                return (
                  <div
                    key={folder.id}
                    className={`bg-stone-850 rounded-lg border border-stone-700 p-2 transition-colors ${draggingTemplateId ? 'border-dashed' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-teal-500'); }}
                    onDragLeave={(e) => { e.currentTarget.classList.remove('border-teal-500'); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove('border-teal-500');
                      const templateId = e.dataTransfer.getData('text/plain');
                      if (templateId) {
                        onMoveTemplateToFolder(templateId, folder.id);
                        setDraggingTemplateId(null);
                      }
                    }}
                    data-testid={`template-folder-${folder.id}`}
                  >
                    <div
                      className="flex items-center justify-between p-2 cursor-pointer hover:bg-stone-800/50 rounded"
                      onClick={() => toggleFolder(folder.id)}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-stone-400 shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-stone-400 shrink-0" />
                        )}
                        <Folder className="h-4 w-4 text-teal-500 shrink-0" />
                        {editingFolderId === folder.id ? (
                          <Input
                            value={editingFolderName}
                            onChange={(e) => setEditingFolderName(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                onUpdateFolder(folder.id, editingFolderName);
                              } else if (e.key === 'Escape') {
                                setEditingFolderId(null);
                              }
                            }}
                            onBlur={() => {
                              if (editingFolderName.trim() && editingFolderName !== folder.name) {
                                onUpdateFolder(folder.id, editingFolderName);
                              }
                              setEditingFolderId(null);
                            }}
                            className="h-6 py-0 px-1 text-sm bg-stone-900 border-stone-600"
                            autoFocus
                            data-testid={`input-edit-template-folder-${folder.id}`}
                          />
                        ) : (
                          <span className="font-medium text-stone-200 truncate">{folder.name}</span>
                        )}
                        <span className="text-xs text-stone-500 shrink-0">({folderTemplates.length})</span>
                      </div>
                      {editingFolderId !== folder.id && (
                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingFolderId(folder.id);
                              setEditingFolderName(folder.name);
                            }}
                            className="h-6 w-6 p-0 text-stone-400 hover:text-stone-200"
                            data-testid={`button-edit-template-folder-${folder.id}`}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onDeleteFolder(folder.id)}
                            className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                            data-testid={`button-delete-template-folder-${folder.id}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                    
                    {isExpanded && (
                      <div className="mt-2 space-y-3 pl-6">
                        {folderTemplates.length > 0 ? (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            {folderTemplates.map(renderCharacterCard)}
                          </div>
                        ) : (
                          <div className="p-3 text-center text-stone-500 text-sm border border-dashed border-stone-700 rounded">
                            Drag templates here
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              
              <div
                className={`bg-stone-850 rounded-lg border border-stone-700 p-2 transition-colors ${draggingTemplateId ? 'border-dashed' : ''}`}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-teal-500'); }}
                onDragLeave={(e) => { e.currentTarget.classList.remove('border-teal-500'); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('border-teal-500');
                  const templateId = e.dataTransfer.getData('text/plain');
                  if (templateId) {
                    onMoveTemplateToFolder(templateId, null);
                    setDraggingTemplateId(null);
                  }
                }}
                data-testid="template-folder-unfiled"
              >
                <div className="flex items-center gap-2 p-2 text-stone-400">
                  <Layers className="h-4 w-4" />
                  <span className="font-medium">Unfiled Templates</span>
                  <span className="text-xs text-stone-500">({unfiledTemplates.length})</span>
                </div>
                <div className="mt-2">
                  {unfiledTemplates.length > 0 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {unfiledTemplates.map(renderCharacterCard)}
                    </div>
                  ) : (
                    <div className="p-3 text-center text-stone-500 text-sm border border-dashed border-stone-700 rounded">
                      No unfiled templates
                    </div>
                  )}
                </div>
              </div>
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
  folders?: CharacterTemplateFolder[];
}

function CharacterFormDialog({ open, onOpenChange, onSave, initialData, isLoading, folders = [] }: CharacterFormDialogProps) {
  const [name, setName] = useState(initialData?.name || "");
  const [selectedRace, setSelectedRace] = useState(initialData?.race || "Human");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(initialData?.folderId || null);
  const [visionType, setVisionType] = useState((initialData as any)?.visionType || "normal");
  const [dayVisionDistance, setDayVisionDistance] = useState((initialData as any)?.dayVisionDistance ?? 120);
  const [nightVisionDistance, setNightVisionDistance] = useState((initialData as any)?.nightVisionDistance ?? 60);
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
      setSelectedFolderId(initialData?.folderId || null);
      setVisionType((initialData as any)?.visionType || "normal");
      setDayVisionDistance((initialData as any)?.dayVisionDistance ?? 120);
      setNightVisionDistance((initialData as any)?.nightVisionDistance ?? 60);
    }
  }, [initialData, open]);

  useEffect(() => {
    if (selectedSpecies && !initialData) {
      setVisionType((selectedSpecies as any).visionType || 'normal');
      setDayVisionDistance((selectedSpecies as any).dayVisionDistance ?? 120);
      setNightVisionDistance((selectedSpecies as any).nightVisionDistance ?? 60);
    }
  }, [selectedRace]);

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
      visionType,
      dayVisionDistance: Number(dayVisionDistance) || 120,
      nightVisionDistance: Number(nightVisionDistance) || 60,
      featTree: selectedSpecies.featTree || "",
      hp: selectedSpecies.startingHp || 10,
      maxHp: selectedSpecies.startingMaxHp || 10,
      energy: selectedSpecies.startingEnergy || 10,
      maxEnergy: selectedSpecies.startingMaxEnergy || 10,
      bonusHpFromLevelUps: 0,
      lastLevelUpRolled: 1,
      folderId: selectedFolderId,
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
    setSelectedFolderId(null);
    setVisionType("normal");
    setDayVisionDistance(120);
    setNightVisionDistance(60);
    setIsSubmitting(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) {
        setName("");
        setSelectedRace("Human");
        setSelectedFolderId(null);
        setVisionType("normal");
        setDayVisionDistance(120);
        setNightVisionDistance(60);
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

          <div className="space-y-2">
            <Label className="text-stone-300">Vision</Label>
            <Select value={visionType} onValueChange={setVisionType}>
              <SelectTrigger className="bg-stone-800 border-stone-700 text-stone-200" data-testid="select-character-vision-type">
                <SelectValue placeholder="Vision type" />
              </SelectTrigger>
              <SelectContent className="bg-stone-800 border-stone-700">
                <SelectItem value="normal" className="text-stone-200">Normal</SelectItem>
                <SelectItem value="darkvision" className="text-stone-200">Darkvision</SelectItem>
                <SelectItem value="blindsight" className="text-stone-200">Blindsight</SelectItem>
                <SelectItem value="truesight" className="text-stone-200">Truesight</SelectItem>
                <SelectItem value="tremorsense" className="text-stone-200">Tremorsense</SelectItem>
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-stone-500">Day Vision (ft)</Label>
                <Input
                  type="number"
                  value={dayVisionDistance}
                  onChange={(e) => setDayVisionDistance(parseInt(e.target.value) || 0)}
                  className="bg-stone-800 border-stone-700 text-stone-200"
                  data-testid="input-character-day-vision"
                />
              </div>
              <div>
                <Label className="text-[10px] text-stone-500">Night Vision (ft)</Label>
                <Input
                  type="number"
                  value={nightVisionDistance}
                  onChange={(e) => setNightVisionDistance(parseInt(e.target.value) || 0)}
                  className="bg-stone-800 border-stone-700 text-stone-200"
                  data-testid="input-character-night-vision"
                />
              </div>
            </div>
            <span className="text-[10px] text-stone-500 italic">Each grid square = 5ft</span>
          </div>

          {folders.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="char-folder" className="text-stone-300">Folder (Optional)</Label>
              <Select value={selectedFolderId || '_unfiled'} onValueChange={(v) => setSelectedFolderId(v === '_unfiled' ? null : v)}>
                <SelectTrigger className="bg-stone-800 border-stone-700 text-stone-200" data-testid="select-character-folder">
                  <Folder className="h-4 w-4 mr-2 text-teal-500" />
                  <SelectValue placeholder="Select a folder" />
                </SelectTrigger>
                <SelectContent className="bg-stone-800 border-stone-700">
                  <SelectItem value="_unfiled" className="text-stone-200">Unfiled</SelectItem>
                  {folders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id} className="text-stone-200">
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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

// Feat node styling (cost-based tiers: 1=purple, 2=violet, 3+=amber)
const featTierStyles: Record<number, { border: string; bg: string; glow: string }> = {
  1: { border: 'border-purple-600', bg: 'bg-gradient-to-br from-purple-900/90 to-stone-900/90', glow: 'shadow-[0_0_10px_rgba(147,51,234,0.3)]' },
  2: { border: 'border-violet-500', bg: 'bg-gradient-to-br from-violet-900/90 to-stone-900/90', glow: 'shadow-[0_0_15px_rgba(139,92,246,0.4)]' },
  3: { border: 'border-amber-500', bg: 'bg-gradient-to-br from-amber-900/90 to-stone-900/90', glow: 'shadow-[0_0_20px_rgba(245,158,11,0.5)]' },
};

const getFeatTier = (feat: any): number => {
  const cost = feat.cost || 1;
  if (cost >= 3) return 3;
  if (cost >= 2) return 2;
  return 1;
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
const NODE_CIRCLE_SIZE = 80;
const NODE_CIRCLE_CENTER_Y = NODE_CIRCLE_SIZE / 2;

function FeatTreesView({ systemSlug, personal }: { systemSlug: string; personal?: boolean }) {
  const queryClient = useQueryClient();
  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
  const [showAddTree, setShowAddTree] = useState(false);
  const [editingTree, setEditingTree] = useState<FeatTree | null>(null);
  const [showFeatEditor, setShowFeatEditor] = useState(false);
  const [editingFeat, setEditingFeat] = useState<Feat | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [showSaveAsTemplate, setShowSaveAsTemplate] = useState(false);
  const [featToSaveAsTemplate, setFeatToSaveAsTemplate] = useState<Partial<Feat> | null>(null);
  const isAAV2 = systemSlug === 'aa-v2' || systemSlug === 'aa-v3';
  const treeLabel = isAAV2 ? 'skill tree' : 'feat tree';
  const treeLabelCap = isAAV2 ? 'Skill Tree' : 'Feat Tree';
  const treeLabelPlural = isAAV2 ? 'Skill Trees' : 'Feat Trees';

  const { data: featTrees = [], isLoading: treesLoading } = useQuery({
    queryKey: ['feat-trees', systemSlug, personal],
    queryFn: () => api.getFeatTrees(systemSlug, undefined, personal),
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

  // Query spells, traits, and skills for fallback descriptions (filtered by system)
  const { data: systemSpellsForFeats = [] } = useQuery({
    queryKey: ['system-spells', systemSlug, personal],
    queryFn: () => api.getSystemSpells(systemSlug, personal),
  });

  const { data: systemItemsForFeats = [] } = useQuery<any[]>({
    queryKey: ['/api/system-items', systemSlug, personal],
    queryFn: () => fetch(`/api/system-items${systemSlug ? `?system=${systemSlug}${personal ? '&personal=1' : ''}` : ''}`, { credentials: 'include' }).then(r => r.json()),
  });
  
  const { data: systemTraitsForFeats = [] } = useQuery({
    queryKey: ['system-traits', systemSlug],
    queryFn: () => api.getSystemTraits(systemSlug),
  });
  
  const { data: customSkillsForFeats = [] } = useQuery({
    queryKey: ['system-skills', systemSlug],
    queryFn: () => api.getSystemSkills(systemSlug),
  });
  
  const getFeatDescription = (feat: Feat): string | undefined => {
    if (feat.description) return feat.description;
    
    if (feat.effects && Array.isArray(feat.effects)) {
      for (const effect of feat.effects as any[]) {
        if (effect.type === 'spell_grant' && effect.target) {
          const spell = (systemSpellsForFeats as any[]).find(s => s.id === effect.target);
          if (spell?.description) return spell.description;
        }
        if (effect.type === 'trait_grant' && effect.target) {
          const trait = (systemTraitsForFeats as any[]).find(t => t.id === effect.target);
          if (trait?.description) return trait.description;
        }
        if (effect.type === 'skill_grant' && effect.target) {
          const skill = (customSkillsForFeats as any[]).find(s => s.id === effect.target);
          if (skill?.description) return skill.description;
        }
        if (effect.type === 'item_grant' && effect.target) {
          const item = (systemItemsForFeats as any[]).find((i: any) => i.id === effect.target);
          if (item?.description) return item.description;
        }
      }
    }
    return undefined;
  };

  const getFeatImage = (feat: Feat): string | null => {
    if ((feat as any).image) return (feat as any).image;
    if (feat.effects && Array.isArray(feat.effects)) {
      for (const effect of feat.effects as any[]) {
        if (effect.type === 'spell_grant' && effect.target) {
          const spell = (systemSpellsForFeats as any[]).find((s: any) => s.id === effect.target);
          if (spell?.icon) return spell.icon;
        }
        if (effect.type === 'item_grant' && effect.target) {
          const item = (systemItemsForFeats as any[]).find((i: any) => i.id === effect.target);
          if (item?.image) return item.image;
        }
      }
    }
    return null;
  };

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
    mutationFn: (tree: Partial<FeatTree>) => api.createFeatTree({ ...tree, system: systemSlug, ...(personal ? { personal: true } : {}) } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feat-trees', systemSlug] });
      setShowAddTree(false);
      toast({ title: 'Success', description: `${treeLabelCap} created` });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const updateTreeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<FeatTree> }) => api.updateFeatTree(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feat-trees', systemSlug] });
      queryClient.invalidateQueries({ queryKey: ['feat-tree', selectedTreeId] });
      setEditingTree(null);
      toast({ title: 'Success', description: `${treeLabelCap} updated` });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const deleteTreeMutation = useMutation({
    mutationFn: (id: string) => api.deleteFeatTree(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feat-trees', systemSlug] });
      if (selectedTreeId === editingTree?.id) {
        setSelectedTreeId(null);
      }
      toast({ title: 'Success', description: `${treeLabelCap} deleted` });
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
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['feat-tree', selectedTreeId] });
      const previousData = queryClient.getQueryData(['feat-tree', selectedTreeId]);
      if (variables.data.gridX !== undefined || variables.data.gridY !== undefined) {
        queryClient.setQueryData(['feat-tree', selectedTreeId], (old: any) => {
          if (!old?.feats) return old;
          return {
            ...old,
            feats: old.feats.map((f: any) =>
              f.id === variables.id ? { ...f, ...variables.data } : f
            ),
          };
        });
        setDragOffset(null);
      }
      return { previousData };
    },
    onSuccess: () => {
      setShowFeatEditor(false);
      setEditingFeat(null);
    },
    onError: (err: any, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['feat-tree', selectedTreeId], context.previousData);
      }
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
    onSettled: (_data, _error, variables) => {
      setPendingDragUpdates(prev => {
        const next = new Map(prev);
        next.delete(variables.id);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['feat-tree', selectedTreeId] });
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
  const suppressClickRef = useRef(false);

  const handleFeatClick = (feat: Feat, e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    
    if (connectionMode && connectingFrom) {
      if (connectingFrom !== feat.id) {
        createConnectionMutation.mutate({
          treeId: selectedTreeId!,
          connection: { fromFeatId: connectingFrom, toFeatId: feat.id, isOptional: false },
        });
      }
      setConnectingFrom(null);
    } else if (connectionMode) {
      setConnectingFrom(feat.id);
    } else {
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

  // Long-press state for mobile drag
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressActiveRef = useRef(false);
  const [longPressId, setLongPressId] = useState<string | null>(null);
  const pendingPointerRef = useRef<{ element: HTMLElement; pointerId: number; feat: Feat; clientX: number; clientY: number } | null>(null);

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressActiveRef.current = false;
    setLongPressId(null);
    pendingPointerRef.current = null;
  };

  const touchPanningRef = useRef(false);

  const handleFeatPointerDown = (feat: Feat, e: React.PointerEvent) => {
    if (connectionMode) return;
    if (pendingDragUpdates.has(feat.id)) return;
    
    const isTouch = e.pointerType === 'touch';
    
    if (isTouch) {
      e.stopPropagation();
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
      touchPanningRef.current = false;

      if (selectedFeatId === feat.id) {
        draggingRef.current = {
          featId: feat.id,
          startX: e.clientX,
          startY: e.clientY,
          origX: feat.gridX * CELL_SIZE,
          origY: feat.gridY * CELL_SIZE,
        };
      } else {
        pendingPointerRef.current = {
          element: e.currentTarget as HTMLElement,
          pointerId: e.pointerId,
          feat,
          clientX: e.clientX,
          clientY: e.clientY,
        };
      }
    } else {
      e.preventDefault();
      e.stopPropagation();
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
      draggingRef.current = {
        featId: feat.id,
        startX: e.clientX,
        startY: e.clientY,
        origX: feat.gridX * CELL_SIZE,
        origY: feat.gridY * CELL_SIZE,
      };
    }
  };

  const handleFeatPointerCancel = () => {
    pendingPointerRef.current = null;
    draggingRef.current = null;
    setDragOffset(null);
    touchPanningRef.current = false;
  };

  const handleFeatPointerMove = (e: React.PointerEvent) => {
    if (pendingPointerRef.current && !touchPanningRef.current) {
      const dx = Math.abs(e.clientX - pendingPointerRef.current.clientX);
      const dy = Math.abs(e.clientY - pendingPointerRef.current.clientY);
      if (dx > 10 || dy > 10) {
        suppressClickRef.current = true;
        touchPanningRef.current = true;
        panStartRef.current = {
          pointerX: pendingPointerRef.current.clientX,
          pointerY: pendingPointerRef.current.clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
        };
        pendingPointerRef.current = null;
      }
      return;
    }

    if (touchPanningRef.current && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.pointerX;
      const dy = e.clientY - panStartRef.current.pointerY;
      const newPan = { x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy };
      panRef.current = newPan;
      motionX.set(newPan.x);
      motionY.set(newPan.y);
      return;
    }
    
    if (!draggingRef.current) return;
    suppressClickRef.current = true;
    
    const zoom = zoomRef.current;
    const dx = (e.clientX - draggingRef.current.startX) / zoom;
    const dy = (e.clientY - draggingRef.current.startY) / zoom;
    
    setDragOffset({ id: draggingRef.current.featId, dx, dy });
  };

  const handleFeatPointerUp = (feat: Feat, e: React.PointerEvent) => {
    if (pendingPointerRef.current) {
      pendingPointerRef.current = null;
    }

    if (touchPanningRef.current) {
      touchPanningRef.current = false;
      panStartRef.current = null;
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
      return;
    }
    
    if (!draggingRef.current || draggingRef.current.featId !== feat.id) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
      return;
    }
    
    const zoom = zoomRef.current;
    const dx = (e.clientX - draggingRef.current.startX) / zoom;
    const dy = (e.clientY - draggingRef.current.startY) / zoom;
    
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      const newX = draggingRef.current.origX + dx;
      const newY = draggingRef.current.origY + dy;
      
      setPendingDragUpdates(prev => new Map(prev).set(feat.id, { dx, dy }));
      
      updateFeatMutation.mutate({
        id: feat.id,
        data: { 
          gridX: Math.round(newX / CELL_SIZE),
          gridY: Math.round(newY / CELL_SIZE),
        },
      });
    } else {
      setDragOffset(null);
    }
    
    draggingRef.current = null;
    
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  // Add new feat at center of viewport
  const handleAddFeat = () => {
    const zoom = zoomRef.current;
    const pan = panRef.current;
    const container = canvasContainerRef.current;
    const rect = container?.getBoundingClientRect();
    const vw = rect?.width || viewportSize.width || 800;
    const vh = rect?.height || viewportSize.height || 600;
    
    const centerX = Math.round((vw / 2 - pan.x) / zoom);
    const centerY = Math.round((vh / 2 - pan.y) / zoom);
    
    setEditingFeat({ 
      gridX: Math.round(centerX / CELL_SIZE), 
      gridY: Math.round(centerY / CELL_SIZE), 
      tier: 1, 
      cost: 1 
    } as Feat);
    setShowFeatEditor(true);
  };

  const handleDuplicateFeat = (feat: Feat) => {
    const zoom = zoomRef.current;
    const pan = panRef.current;
    const container = canvasContainerRef.current;
    const rect = container?.getBoundingClientRect();
    const vw = rect?.width || viewportSize.width || 800;
    const vh = rect?.height || viewportSize.height || 600;
    const centerX = Math.round((vw / 2 - pan.x) / zoom);
    const centerY = Math.round((vh / 2 - pan.y) / zoom);

    const newFeat: Partial<Feat> = {
      name: feat.name + ' (Copy)',
      description: (feat as any).description || undefined,
      icon: feat.icon || undefined,
      image: (feat as any).image || undefined,
      gridX: Math.round(centerX / CELL_SIZE) + 1,
      gridY: Math.round(centerY / CELL_SIZE),
      tier: feat.tier || 1,
      cost: feat.cost || 1,
      effects: (feat as any).effects || [],
    };
    createFeatMutation.mutate({ treeId: selectedTreeId!, feat: newFeat });
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

  // Reset view when tree changes - use default view if set
  useEffect(() => {
    if (selectedTreeId && viewportSize.width > 0 && treeData) {
      if (treeData.tree?.defaultViewX != null && treeData.tree?.defaultViewY != null) {
        const worldCenterX = treeData.tree.defaultViewX;
        const worldCenterY = treeData.tree.defaultViewY;
        const defaultZoom = treeData.tree.defaultViewZoom || 1;
        
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
    
    // Don't start pan if clicking on a feat (mouse only - touch uses long-press for drag) or connection delete button
    const target = e.target as HTMLElement;
    if (target.closest('[data-connection-delete]')) return;
    if (e.pointerType !== 'touch' && target.closest('[data-feat-cell]')) return;
    
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
      if (treeData.tree?.defaultViewX != null && treeData.tree?.defaultViewY != null) {
        const worldCenterX = treeData.tree.defaultViewX;
        const worldCenterY = treeData.tree.defaultViewY;
        const defaultZoom = treeData.tree.defaultViewZoom || 1;
        
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
      <div className="flex flex-col flex-1 min-h-0 gap-3">
        {/* Toolbar - moved outside canvas */}
        <div className="flex flex-wrap gap-2 items-center shrink-0">
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
          className={`relative w-full overflow-hidden rounded-lg border border-stone-700 ${
            connectionMode ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
          }`}
          style={{ 
            height: 'calc(100vh - 280px)',
            minHeight: '400px',
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
              const y1 = WORLD_OFFSET + fromY + NODE_CIRCLE_CENTER_Y;
              const x2 = WORLD_OFFSET + toX + NODE_WIDTH / 2;
              const y2 = WORLD_OFFSET + toY + NODE_CIRCLE_CENTER_Y;
              
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
            const featImage = getFeatImage(feat);
            const featStyle = featTierStyles[getFeatTier(feat)] || featTierStyles[1];
            
            let posX = feat.gridX * CELL_SIZE;
            let posY = feat.gridY * CELL_SIZE;
            if (isDragging && dragOffset) {
              posX += dragOffset.dx;
              posY += dragOffset.dy;
            }
            
            return (
              <div
                key={feat.id}
                data-feat-cell
                className={`absolute flex flex-col items-center ${connectionMode ? 'cursor-crosshair' : 'cursor-move'}`}
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
                onPointerCancel={handleFeatPointerCancel}
                onDragStart={(e) => e.preventDefault()}
                data-testid={`feat-node-${feat.id}`}
              >
                <div
                  className={`rounded-full border-[3px] overflow-hidden transition-all shrink-0
                    ${featStyle.border} ${featStyle.glow}
                    ${isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-stone-900 scale-105' : ''}
                    ${isConnectSource ? 'animate-pulse ring-2 ring-purple-400' : ''}
                    ${longPressId === feat.id ? 'ring-2 ring-amber-400 scale-110' : ''}
                    ${!isDragging ? 'hover:scale-105' : ''}
                  `}
                  style={{ width: NODE_CIRCLE_SIZE, height: NODE_CIRCLE_SIZE }}
                >
                  {featImage ? (
                    <img src={featImage} alt={feat.name} className="w-full h-full object-cover" draggable={false} />
                  ) : (
                    <div className={`w-full h-full flex items-center justify-center text-center p-1 ${featStyle.bg}`}>
                      <span className="text-[10px] font-bold text-white leading-tight">{feat.name}</span>
                    </div>
                  )}
                </div>
                <div className="text-[10px] font-semibold text-center mt-1 max-w-[90px] truncate text-purple-300">
                  {feat.name}
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
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60"
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
                {(() => {
                  const actionFeat = featById.get(featActionMenu);
                  const desc = actionFeat ? getFeatDescription(actionFeat) : undefined;
                  return desc ? (
                    <p className="text-xs text-stone-400 mt-1 line-clamp-2">{desc}</p>
                  ) : null;
                })()}
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
                
                <button
                  className="w-full px-4 py-3 rounded-lg bg-stone-700 hover:bg-green-700 transition-colors flex items-center gap-3 text-stone-200"
                  onClick={() => {
                    const feat = featById.get(featActionMenu);
                    if (feat) handleDuplicateFeat(feat);
                    setFeatActionMenu(null);
                  }}
                >
                  <Copy className="h-5 w-5 text-green-400" />
                  <span>Duplicate Feat</span>
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
          <CardTitle className="text-purple-500">{treeLabelPlural}</CardTitle>
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
              <p className="font-bold">No {treeLabelPlural.toLowerCase()} yet</p>
              <p className="text-sm mt-2">Create a {treeLabel} to define character progression paths</p>
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
                        if (confirm(`Delete this ${treeLabel} and all its nodes?`)) {
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
          isAAV2={isAAV2}
        />

        {editingTree && (
          <FeatTreeFormDialog
            open={!!editingTree}
            onOpenChange={() => setEditingTree(null)}
            onSave={(data) => updateTreeMutation.mutate({ id: editingTree.id, data })}
            initialData={editingTree}
            isLoading={updateTreeMutation.isPending}
            isAAV2={isAAV2}
          />
        )}
      </Card>
    );
  }

  return (
    <Card className="bg-stone-900 border-stone-700 flex flex-col flex-1 min-h-0">
      <CardHeader className="flex flex-row items-center gap-4 shrink-0">
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
      <CardContent className="p-0 sm:p-2 flex-1 flex flex-col min-h-0">
        {treeDataLoading ? (
          <div className="text-center py-12 text-stone-400">Loading tree...</div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="px-4 py-2 text-xs text-stone-500 border-b border-stone-800 shrink-0">
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
          isAAV2={isAAV2}
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
        systemSlug={systemSlug}
        personal={personal}
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
  isAAV2?: boolean;
}

function FeatTreeFormDialog({ open, onOpenChange, onSave, initialData, isLoading, isAAV2 }: FeatTreeFormDialogProps) {
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
            {initialData ? `Edit ${isAAV2 ? 'Skill Tree' : 'Feat Tree'}` : `Create ${isAAV2 ? 'Skill Tree' : 'Feat Tree'}`}
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
  mana_increase: { icon: Sparkles, color: 'text-fuchsia-400' },
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
  systemSlug?: string;
  personal?: boolean;
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

function FeatFormDialog({ open, onOpenChange, onSave, initialData, isLoading, featTemplates = [], onSaveAsTemplate, systemSlug, personal }: FeatFormDialogProps) {
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showFeatImageBrowser, setShowFeatImageBrowser] = useState(false);
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    description: initialData?.description || '',
    image: (initialData as any)?.image || '',
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

  // Query system spells for spell_grant dropdown (filtered by system)
  const { data: systemSpells = [] } = useQuery({
    queryKey: ['admin-spells', systemSlug],
    queryFn: () => api.getSystemSpells(systemSlug),
    enabled: open,
  });

  // Query custom skills for skill_grant dropdown (filtered by system)
  const { data: customSkills = [] } = useQuery({
    queryKey: ['admin-skills', systemSlug],
    queryFn: () => api.getSystemSkills(systemSlug),
    enabled: open,
  });

  // Query system items for item_grant dropdown (filtered by system)
  const { data: systemItems = [] } = useQuery<any[]>({
    queryKey: ['/api/system-items', systemSlug, personal],
    queryFn: () => fetch(`/api/system-items${systemSlug ? `?system=${systemSlug}${personal ? '&personal=1' : ''}` : ''}`, { credentials: 'include' }).then(r => r.json()),
    enabled: open,
  });

  // Query system traits for trait_grant dropdown (filtered by system)
  const { data: systemTraitsForDropdown = [] } = useQuery({
    queryKey: ['admin-traits', systemSlug],
    queryFn: () => api.getSystemTraits(systemSlug),
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
        image: (initialData as any)?.image || '',
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
        image: '',
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
            <Label className="text-xs text-stone-400">Node Image</Label>
            <div className="flex items-center gap-3 mt-1">
              {formData.image ? (
                <div className="relative">
                  <img src={formData.image} alt="" className="h-14 w-14 rounded-full object-cover border-2 border-purple-500" />
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, image: '' })}
                    className="absolute -top-1 -right-1 bg-red-600 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
              ) : (
                <div className="h-14 w-14 rounded-full bg-stone-700 border-2 border-dashed border-stone-500 flex items-center justify-center">
                  <ImageIcon className="h-5 w-5 text-stone-500" />
                </div>
              )}
              <div className="flex flex-col gap-1">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowFeatImageBrowser(true)} className="text-xs">
                  Browse Images
                </Button>
                <Input
                  value={formData.image}
                  onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                  placeholder="Or paste image URL"
                  className="bg-stone-800 border-stone-700 text-xs h-7"
                />
              </div>
            </div>
            <ImageBrowser
              open={showFeatImageBrowser}
              onOpenChange={setShowFeatImageBrowser}
              onSelect={(url) => {
                setFormData({ ...formData, image: url });
                setShowFeatImageBrowser(false);
              }}
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
                    const hasLegacyTarget = !effect.subtype && target && target !== '';
                    if (hasLegacyTarget) {
                      return `HP: ${target}`;
                    }
                    return `+${value} HP${subtypeLabel}`;
                  }
                  if (effect.type === 'energy_bonus') {
                    const subtypeLabel = effect.subtype === 'per_level' ? '/level' : '';
                    return `+${value} Energy${subtypeLabel}`;
                  }
                  if (effect.type === 'mana_increase') {
                    const subtypeLabel = effect.subtype === 'per_level' ? '/level' : '';
                    return `+${value} Mana${subtypeLabel}`;
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
                    onValueChange={(v) => setNewEffect({ ...newEffect, type: v, target: '', subtype: (v === 'hp_bonus' || v === 'energy_bonus' || v === 'mana_increase') ? 'flat' : undefined })}
                  >
                    <SelectTrigger className="bg-stone-800 border-stone-700 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hp_bonus">HP Bonus</SelectItem>
                      <SelectItem value="energy_bonus">Energy Bonus</SelectItem>
                      <SelectItem value="mana_increase">Mana Increase</SelectItem>
                      <SelectItem value="dc_bonus">DC Bonus</SelectItem>
                      <SelectItem value="skill_bonus">Skill Bonus</SelectItem>
                      <SelectItem value="attribute_bonus">Attribute Bonus</SelectItem>
                      <SelectItem value="spell_grant">Grant Spell</SelectItem>
                      <SelectItem value="item_grant">Grant Item</SelectItem>
                      <SelectItem value="skill_grant">{systemSlug === 'aa-v3' ? 'Grant Knowledge' : 'Grant Custom Skill'}</SelectItem>
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
                {(newEffect.type === 'hp_bonus' || newEffect.type === 'energy_bonus' || newEffect.type === 'mana_increase') && (
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
                        ? `Adds ${newEffect.type === 'hp_bonus' ? 'HP' : newEffect.type === 'energy_bonus' ? 'Energy' : 'Mana'} each level` 
                        : `One-time ${newEffect.type === 'hp_bonus' ? 'HP' : newEffect.type === 'energy_bonus' ? 'Energy' : 'Mana'} boost`}
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
                        <span className="text-stone-400">{systemSlug === 'aa-v3' ? 'Select knowledge...' : 'Select custom skill...'}</span>
                      )}
                      <Search className="h-3 w-3" />
                    </Button>
                    {/* Skill Picker Dialog */}
                    <Dialog open={showSkillPicker} onOpenChange={setShowSkillPicker}>
                      <DialogContent className="max-w-lg bg-stone-900 border-stone-700 max-h-[80vh] flex flex-col">
                        <DialogHeader>
                          <DialogTitle className="text-pink-400 flex items-center gap-2">
                            <Sparkles className="h-5 w-5" />
                            {systemSlug === 'aa-v3' ? 'Select Knowledge' : 'Select Custom Skill'}
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
                              <p>{systemSlug === 'aa-v3' ? 'No knowledge created yet' : 'No custom skills created yet'}</p>
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
          <Button size="sm" disabled={!selectedEffectId || addMutation.isPending} onClick={() => addMutation.mutate()}>
            {addMutation.isPending ? '...' : 'Add'}
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
          <Button size="sm" disabled={!selectedEffectId || addMutation.isPending} onClick={() => addMutation.mutate()}>
            {addMutation.isPending ? '...' : 'Add'}
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
  onSave: (data: Partial<SystemSpell>, draftRolls?: any[], templateLinks?: string[]) => void;
  initialData?: SystemSpell;
  isLoading?: boolean;
  campaignSystem?: string;
  personal?: boolean;
}

const spellAttributes = ['might', 'finesse', 'wit', 'presence', 'will', 'craft'];

function SpellFormDialog({ open, onOpenChange, onSave, initialData, isLoading, campaignSystem, personal }: SpellFormDialogProps) {
  const [draftRolls, setDraftRolls] = useState<any[]>([]);
  const isAaV2 = campaignSystem === 'aa-v2' || campaignSystem === 'aa-v3';

  // Spell ↔ live spell-template links (AAv2/V3). Loaded on edit; sent on save.
  const [selectedTemplateLinks, setSelectedTemplateLinks] = useState<string[]>([]);
  const { data: existingSpellLinks } = useQuery<{ templateIds: string[] }>({
    queryKey: ['spell-template-links', initialData?.id],
    queryFn: () => api.getSpellTemplateLinks(initialData!.id),
    enabled: !!initialData?.id && isAaV2,
    staleTime: 60 * 1000,
  });
  useEffect(() => {
    if (existingSpellLinks?.templateIds) {
      setSelectedTemplateLinks(existingSpellLinks.templateIds);
    }
  }, [existingSpellLinks]);
  useEffect(() => {
    if (!initialData?.id) {
      setSelectedTemplateLinks([]);
    }
  }, [initialData?.id]);

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
    attribute: string;
  }>({
    name: initialData?.name || '',
    description: initialData?.description || '',
    icon: initialData?.icon || '',
    castingTime: normalizeCastingTime(initialData?.castingTime),
    range: initialData?.rangeNum ?? 30,
    duration: normalizeDuration(initialData?.duration),
    attribute: initialData?.attribute || '',
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
        attribute: initialData.attribute || '',
      });
    } else {
      setFormData({
        name: '',
        description: '',
        icon: '',
        castingTime: 'action',
        range: 30,
        duration: 'Instant',
        attribute: '',
      });
    }
    setDraftRolls([]);
  }, [initialData, open]);

  const handleNumericChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value === '' ? '' : parseInt(value) });
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ title: 'Error', description: 'Spell name is required', variant: 'destructive' });
      return;
    }
    const normalizeNone = (val: string) => val === '_none' ? '' : val;
    // Template links: in AAv2 edit mode, the SpellTemplateLinksPanel commits
    // every checkbox toggle to the server live, so save-time sync would just
    // be a redundant write that can race against an in-flight live mutation.
    // We only need to sync at save time for brand-new spells (no id yet).
    const linksToSync = isAaV2 && !initialData?.id
      ? selectedTemplateLinks
      : undefined;
    onSave({
      name: formData.name,
      description: formData.description,
      icon: formData.icon || undefined,
      castingTime: formData.castingTime,
      range: `${formData.range} ft`,
      rangeNum: Number(formData.range) || 30,
      duration: formData.duration,
      attribute: normalizeNone(formData.attribute),
    }, !initialData ? draftRolls : undefined, linksToSync);
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

            </div>
          </div>

          <div className="pt-4 border-t border-stone-700">
            <RollEntriesEditor 
              ownerType="spell" 
              ownerId={initialData?.id}
              canEdit={true}
              draftRolls={!initialData?.id ? draftRolls : undefined}
              onDraftRollsChange={!initialData?.id ? setDraftRolls : undefined}
              campaignSystem={campaignSystem || 'arcana-adventure'}
            />
          </div>

          {isAaV2 && !(initialData as any)?.isLiveTemplate && (
            <div className="pt-4 border-t border-stone-700">
              <ItemTemplateLinksPanel
                systemSlug={campaignSystem || 'aa-v2'}
                personal={personal}
                selectedIds={selectedTemplateLinks}
                onSelectedIdsChange={setSelectedTemplateLinks}
                ownerType="spell"
                ownerId={initialData?.id}
              />
            </div>
          )}

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

interface TemplateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: any, draftRolls?: any[]) => void;
  initialData?: any;
  isLoading?: boolean;
  campaignSystem?: string;
}

function TemplateFormDialog({ open, onOpenChange, onSave, initialData, isLoading, campaignSystem }: TemplateFormDialogProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [draftRolls, setDraftRolls] = useState<any[]>([]);
  // Template-level ordering controls. `templatePriority` slots this template's
  // inherited rolls into the owner's overall list (lower = higher up).
  // `templateUseOwnOrder` makes the inherited rolls render as one contiguous
  // group (anchored at templatePriority) ordered internally by their own
  // per-roll priorities, instead of being interleaved with the owner's other rolls.
  const [templatePriority, setTemplatePriority] = useState<number>(initialData?.templatePriority ?? 1);
  const [templateUseOwnOrder, setTemplateUseOwnOrder] = useState<boolean>(initialData?.templateUseOwnOrder ?? false);

  useEffect(() => {
    if (open) {
      setName(initialData?.name || '');
      setDraftRolls([]);
      setTemplatePriority(initialData?.templatePriority ?? 1);
      setTemplateUseOwnOrder(initialData?.templateUseOwnOrder ?? false);
    }
  }, [open, initialData?.id]);

  const handleSave = () => {
    if (!name.trim()) {
      toast({ title: 'Name Required', description: 'Please give the template a name.', variant: 'destructive' });
      return;
    }
    const payload: any = {
      name: name.trim(),
      itemType: initialData?.itemType || 'utility',
      rarity: initialData?.rarity || 'common',
      templatePriority,
      templateUseOwnOrder,
    };
    onSave(payload, !initialData?.id ? draftRolls : undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-amber-500">
            {initialData?.id ? 'Edit Item Template' : 'New Item Template'}
          </DialogTitle>
          <DialogDescription className="text-stone-400">
            Templates are reusable bundles of rolls. Assign one to any item to give that item these rolls -- edits here flow to every linked item.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          <div className="space-y-2">
            <Label htmlFor="template-name" className="text-stone-300">Template Name</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Fire Damage Bundle"
              className="bg-stone-800 border-stone-700"
              data-testid="input-template-name"
            />
          </div>

          <div className="pt-4 border-t border-stone-700">
            <RollEntriesEditor
              ownerType="item"
              ownerId={initialData?.id}
              canEdit={true}
              draftRolls={!initialData?.id ? draftRolls : undefined}
              onDraftRollsChange={!initialData?.id ? setDraftRolls : undefined}
              campaignSystem={campaignSystem || 'arcana-adventure'}
            />
          </div>

          <div className="pt-4 border-t border-stone-700 space-y-3">
            <div className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Template Ordering</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="template-priority" className="text-stone-300 text-xs">
                  Template Priority
                </Label>
                <Input
                  id="template-priority"
                  type="number"
                  value={templatePriority}
                  onChange={(e) => setTemplatePriority(Number(e.target.value))}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-template-priority"
                />
                <p className="text-[10px] text-stone-500">Lower sorts higher. Used to slot this template's rolls into the owner's list.</p>
              </div>
              <div className="space-y-1">
                <Label className="text-stone-300 text-xs">Group Mode</Label>
                <label className="flex items-start gap-2 text-xs text-stone-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={templateUseOwnOrder}
                    onChange={(e) => setTemplateUseOwnOrder(e.target.checked)}
                    className="mt-0.5"
                    data-testid="checkbox-template-use-own-order"
                  />
                  <span>
                    Use template's own roll ordering
                    <span className="block text-[10px] text-stone-500">When on, this template's rolls render as one contiguous group anchored at Template Priority, ordered internally by their own priorities.</span>
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-stone-700" data-testid="button-cancel-template">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading} className="bg-amber-700 hover:bg-amber-600" data-testid="button-save-template">
            {isLoading ? 'Saving...' : (initialData?.id ? 'Save Changes' : 'Create Template')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ItemTemplateLinksPanel({
  systemSlug,
  selectedIds,
  onSelectedIdsChange,
  ownerType,
  ownerId,
  personal,
}: {
  systemSlug: string;
  personal?: boolean;
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  // When ownerType + ownerId are provided, every checkbox toggle commits to
  // the server immediately (live mode) so rolls fan out the moment the user
  // ticks the box. When ownerId is missing (e.g. creating a brand-new item or
  // spell that does not yet have an id), the panel falls back to buffered
  // mode and the parent form syncs links on save.
  ownerType?: 'item' | 'spell';
  ownerId?: string;
}) {
  const [expanded, setExpanded] = useState<boolean>(false);
  const queryClient = useQueryClient();
  const isLive = !!ownerId && !!ownerType;
  const [pendingId, setPendingId] = useState<string | null>(null);

  const { data: templates = [] } = useQuery<Item[]>({
    queryKey: ['item-templates', systemSlug, personal],
    queryFn: () => api.getItemTemplates(systemSlug, personal),
    staleTime: 5 * 60 * 1000,
  });

  const liveMutation = useMutation({
    mutationFn: async (nextIds: string[]) => {
      if (!ownerId || !ownerType) throw new Error('Live mode requires ownerType and ownerId');
      if (ownerType === 'item') {
        return api.setItemTemplateLinks(ownerId, nextIds);
      }
      return api.setSpellTemplateLinks(ownerId, nextIds);
    },
    onSuccess: (data, nextIds) => {
      // Update the parent's local state and invalidate the rolls editor + the
      // template-links query so the inherited rolls re-render right away.
      onSelectedIdsChange(data?.templateIds ?? nextIds);
      if (ownerType && ownerId) {
        queryClient.invalidateQueries({ queryKey: ['rollEntries', ownerType, ownerId] });
        queryClient.invalidateQueries({
          queryKey: [ownerType === 'item' ? 'item-template-links' : 'spell-template-links', ownerId],
        });
      }
      setPendingId(null);
    },
    onError: (err: any) => {
      setPendingId(null);
      toast({ title: 'Failed to update template links', description: err?.message || String(err), variant: 'destructive' });
    },
  });

  const toggle = (templateId: string) => {
    const next = selectedIds.includes(templateId)
      ? selectedIds.filter(id => id !== templateId)
      : [...selectedIds, templateId];
    if (isLive) {
      setPendingId(templateId);
      liveMutation.mutate(next);
    } else {
      onSelectedIdsChange(next);
    }
  };

  const summary = selectedIds.length === 0
    ? 'No templates linked'
    : `${selectedIds.length} template${selectedIds.length === 1 ? '' : 's'} linked`;

  return (
    <div data-testid="panel-item-template-links">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between p-2 rounded bg-stone-800/60 hover:bg-stone-800 border border-stone-700 text-left"
        data-testid="button-toggle-template-links"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="h-4 w-4 text-amber-500" /> : <ChevronRight className="h-4 w-4 text-amber-500" />}
          <Layers className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-medium text-amber-500">Roll Templates</span>
          <span className="text-xs text-stone-400">({summary})</span>
        </div>
      </button>
      {expanded && (
        <div className="mt-2 p-3 rounded border border-stone-700 bg-stone-900/40">
          <p className="text-xs text-stone-500 mb-3">
            {isLive
              ? `Tick a box to add this template's rolls to the ${ownerType} immediately. Untick to remove its inherited rolls. Future edits to the template propagate automatically.`
              : `Attach roll templates. Their rolls will be copied onto this ${ownerType ?? 'item'}, and any future edits to those template rolls will propagate automatically.`}
          </p>
          {templates.length === 0 ? (
            <p className="text-xs text-stone-500">No roll templates exist yet. Create one in the Roll Templates view.</p>
          ) : (
            <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
              {templates.map((t) => {
                const checked = selectedIds.includes(t.id);
                const isPending = liveMutation.isPending && pendingId === t.id;
                return (
                  <label
                    key={t.id}
                    className={`flex items-center gap-2 p-1.5 rounded hover:bg-stone-800 ${liveMutation.isPending ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
                    data-testid={`label-template-link-${t.id}`}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={liveMutation.isPending}
                      onCheckedChange={() => toggle(t.id)}
                      data-testid={`checkbox-template-link-${t.id}`}
                    />
                    <span className="text-sm text-stone-200">{t.name}</span>
                    {isPending && <span className="text-xs text-amber-500 ml-auto">Saving…</span>}
                  </label>
                );
              })}
            </div>
          )}
          {!isLive && (
            <p className="text-xs text-amber-600/80 mt-2">Template links are saved when you save the {ownerType ?? 'item'}.</p>
          )}
        </div>
      )}
    </div>
  );
}

function ItemTemplateLinkPicker({ itemId, currentTemplateId, systemSlug, personal }: { itemId: string; currentTemplateId: string | null; systemSlug: string; personal?: boolean }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string>(currentTemplateId || 'none');

  useEffect(() => {
    setSelected(currentTemplateId || 'none');
  }, [currentTemplateId]);

  const { data: templates = [] } = useQuery({
    queryKey: ['item-templates', systemSlug, personal],
    queryFn: () => api.getItemTemplates(systemSlug, personal),
    staleTime: 5 * 60 * 1000,
  });

  const linkMutation = useMutation({
    mutationFn: (templateId: string | null) => api.linkItemToTemplate(itemId, templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roll-entries', 'item', itemId] });
      queryClient.invalidateQueries({ queryKey: ['system-items'] });
      queryClient.invalidateQueries({ queryKey: ['system-items-summary'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-items'] });
      queryClient.invalidateQueries({ queryKey: ['character-items'] });
      toast({ title: 'Template Linked', description: 'Item synced to template. Future template edits will propagate automatically.' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message || 'Failed to link template', variant: 'destructive' });
    },
  });

  const handleApply = () => {
    const value = selected === 'none' ? null : selected;
    if (value === currentTemplateId) return;
    linkMutation.mutate(value);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Layers className="h-4 w-4 text-amber-500" />
        <Label className="text-amber-500">Linked Template</Label>
      </div>
      <p className="text-xs text-stone-500 mb-3">
        Assign this item to a template. Template rolls and properties will be copied in immediately and stay in sync with future edits.
      </p>
      <div className="flex gap-2">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="bg-stone-800 border-stone-700 flex-1" data-testid="select-linked-template">
            <SelectValue placeholder="No template" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No template (standalone)</SelectItem>
            {templates.map((t: any) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          onClick={handleApply}
          disabled={linkMutation.isPending || (selected === 'none' ? !currentTemplateId : selected === currentTemplateId)}
          className="bg-amber-700 hover:bg-amber-600"
          data-testid="button-apply-template-link"
        >
          {linkMutation.isPending ? 'Applying...' : 'Apply'}
        </Button>
      </div>
    </div>
  );
}

const CLASS_CELL_SIZE = 100;
const CLASS_NODE_WIDTH = 160;
const CLASS_NODE_HEIGHT = 100;
const CLASS_NODE_CIRCLE_SIZE = 80;
const CLASS_NODE_CIRCLE_CENTER_Y = CLASS_NODE_CIRCLE_SIZE / 2;
const CLASS_WORLD_SIZE = 20000;
const CLASS_WORLD_OFFSET = 10000;

const classTierStyles: Record<number, { border: string; bg: string; glow: string }> = {
  1: { border: 'border-fuchsia-600', bg: 'bg-gradient-to-br from-fuchsia-900/90 to-stone-900/90', glow: 'shadow-[0_0_10px_rgba(217,70,239,0.3)]' },
  2: { border: 'border-violet-500', bg: 'bg-gradient-to-br from-violet-900/90 to-stone-900/90', glow: 'shadow-[0_0_15px_rgba(139,92,246,0.4)]' },
  3: { border: 'border-amber-500', bg: 'bg-gradient-to-br from-amber-900/90 to-stone-900/90', glow: 'shadow-[0_0_20px_rgba(245,158,11,0.5)]' },
};

function ClassesView({ systemSlug: parentSystemSlug, personal }: { systemSlug?: string; personal?: boolean }) {
  const effectiveClassSystem: 'aa-v2' | 'aa-v3' = parentSystemSlug === 'aa-v3' ? 'aa-v3' : 'aa-v2';
  const queryClient = useQueryClient();
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [showAddClass, setShowAddClass] = useState(false);
  const [editingClass, setEditingClass] = useState<any | null>(null);
  const [className, setClassName] = useState('');
  const [classDesc, setClassDesc] = useState('');
  const [classImage, setClassImage] = useState('');
  const [classSkillTreeId, setClassSkillTreeId] = useState('');
  const [classApplyToAll, setClassApplyToAll] = useState(false);
  const [showClassImageBrowser, setShowClassImageBrowser] = useState(false);
  const classImageInputRef = useRef<HTMLInputElement>(null);
  const [showNodeEditor, setShowNodeEditor] = useState(false);
  const [editingNode, setEditingNode] = useState<any | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const [, forceUpdate] = useState(0);
  const motionX = useMotionValue(0);
  const motionY = useMotionValue(0);
  const motionZoom = useMotionValue(1);
  type ClassGestureMode = 'idle' | 'panning' | 'pinching';
  const gestureModeRef = useRef<ClassGestureMode>('idle');
  const panStartRef = useRef<{ pointerX: number; pointerY: number; panX: number; panY: number } | null>(null);
  const panPointerIdRef = useRef<number | null>(null);
  const lastTouchDistanceRef = useRef<number | null>(null);
  const [isPinching, setIsPinching] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  const draggingRef = useRef<{ nodeId: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [pendingDragUpdates, setPendingDragUpdates] = useState<Map<string, { dx: number; dy: number }>>(new Map());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeActionMenu, setNodeActionMenu] = useState<string | null>(null);

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressActiveRef = useRef(false);
  const [longPressId, setLongPressId] = useState<string | null>(null);
  const pendingPointerRef = useRef<{ element: HTMLElement; pointerId: number; nodeId: string; clientX: number; clientY: number } | null>(null);

  const { data: classes = [], isLoading } = useQuery({
    queryKey: ['admin-classes', effectiveClassSystem, personal],
    queryFn: async () => {
      const res = await fetch(`/api/admin/classes?system=${effectiveClassSystem}${personal ? '&personal=1' : ''}`, { credentials: 'include' });
      return res.json();
    },
  });

  const { data: classSpells = [] } = useQuery({
    queryKey: ['system-spells', effectiveClassSystem, personal],
    queryFn: () => api.getSystemSpells(effectiveClassSystem, personal),
  });

  const { data: classItems = [] } = useQuery<any[]>({
    queryKey: ['/api/system-items', effectiveClassSystem, personal],
    queryFn: () => fetch(`/api/system-items?system=${effectiveClassSystem}${personal ? '&personal=1' : ''}`, { credentials: 'include' }).then(r => r.json()),
  });

  const getNodeImage = (node: any): string | null => {
    if (node.image) return node.image;
    if (node.effects && Array.isArray(node.effects)) {
      for (const effect of node.effects as any[]) {
        if (effect.type === 'spell_grant' && effect.target) {
          const spell = (classSpells as any[]).find((s: any) => s.id === effect.target);
          if (spell?.icon) return spell.icon;
        }
        if (effect.type === 'item_grant' && effect.target) {
          const item = (classItems as any[]).find((i: any) => i.id === effect.target);
          if (item?.image) return item.image;
        }
      }
    }
    return null;
  };

  const { data: skillTreesForClasses = [] } = useQuery({
    queryKey: ['feat-trees', effectiveClassSystem, personal],
    queryFn: () => api.getFeatTrees(effectiveClassSystem, undefined, personal),
  });

  const { data: nodes = [] } = useQuery({
    queryKey: ['class-nodes', selectedClassId],
    queryFn: async () => {
      if (!selectedClassId) return [];
      const res = await fetch(`/api/admin/classes/${selectedClassId}/nodes`, { credentials: 'include' });
      return res.json();
    },
    enabled: !!selectedClassId,
  });

  const { data: connections = [] } = useQuery({
    queryKey: ['class-connections', selectedClassId],
    queryFn: async () => {
      if (!selectedClassId) return [];
      const res = await fetch(`/api/admin/classes/${selectedClassId}/connections`, { credentials: 'include' });
      return res.json();
    },
    enabled: !!selectedClassId,
  });

  const createClassMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; applyToAll?: boolean }) => {
      const res = await fetch('/api/admin/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...data, system: effectiveClassSystem, image: classImage || null, skillTreeId: classSkillTreeId || null, ...(personal ? { personal: true } : {}) }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-classes'] });
      setShowAddClass(false);
      setClassName('');
      setClassDesc('');
      setClassImage('');
      toast({ title: "Class created" });
    },
  });

  const updateClassMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await fetch(`/api/admin/classes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-classes'] });
      setEditingClass(null);
      toast({ title: "Class updated" });
    },
  });

  const deleteClassMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/admin/classes/${id}`, { method: 'DELETE', credentials: 'include' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-classes'] });
      if (selectedClassId) setSelectedClassId(null);
      toast({ title: "Class deleted" });
    },
  });

  const createNodeMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/admin/classes/${selectedClassId}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['class-nodes', selectedClassId] });
    },
  });

  const updateNodeMutation = useMutation({
    mutationFn: async ({ nodeId, data }: { nodeId: string; data: any }) => {
      const res = await fetch(`/api/admin/classes/${selectedClassId}/nodes/${nodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['class-nodes', selectedClassId] });
      const previousData = queryClient.getQueryData(['class-nodes', selectedClassId]);
      if (variables.data.gridX !== undefined || variables.data.gridY !== undefined) {
        queryClient.setQueryData(['class-nodes', selectedClassId], (old: any[]) =>
          old?.map(n => n.id === variables.nodeId ? { ...n, gridX: variables.data.gridX ?? n.gridX, gridY: variables.data.gridY ?? n.gridY } : n)
        );
        setDragOffset(null);
      }
      return { previousData };
    },
    onSuccess: () => {
      setShowNodeEditor(false);
      setEditingNode(null);
    },
    onError: (err: any, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['class-nodes', selectedClassId], context.previousData);
      }
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
    onSettled: (_data, _error, variables) => {
      setPendingDragUpdates(prev => {
        const next = new Map(prev);
        next.delete(variables.nodeId);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['class-nodes', selectedClassId] });
    },
  });

  const deleteNodeMutation = useMutation({
    mutationFn: async (nodeId: string) => {
      await fetch(`/api/admin/classes/${selectedClassId}/nodes/${nodeId}`, { method: 'DELETE', credentials: 'include' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['class-nodes', selectedClassId] });
      queryClient.invalidateQueries({ queryKey: ['class-connections', selectedClassId] });
    },
  });

  const createConnectionMutation = useMutation({
    mutationFn: async (data: { fromNodeId: string; toNodeId: string }) => {
      const res = await fetch(`/api/admin/classes/${selectedClassId}/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['class-connections', selectedClassId] });
      setConnectingFrom(null);
    },
  });

  const deleteConnectionMutation = useMutation({
    mutationFn: async (connId: string) => {
      await fetch(`/api/admin/classes/${selectedClassId}/connections/${connId}`, { method: 'DELETE', credentials: 'include' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['class-connections', selectedClassId] });
    },
  });

  const cancelLongPressClass = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressActiveRef.current = false;
    setLongPressId(null);
    pendingPointerRef.current = null;
  };

  const touchPanningRefClass = useRef(false);

  const handleNodePointerDown = (node: any, e: React.PointerEvent) => {
    if (connectingFrom) return;
    if (pendingDragUpdates.has(node.id)) return;
    const isTouch = e.pointerType === 'touch';
    if (isTouch) {
      e.stopPropagation();
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
      touchPanningRefClass.current = false;

      if (selectedNodeId === node.id) {
        draggingRef.current = {
          nodeId: node.id,
          startX: e.clientX,
          startY: e.clientY,
          origX: node.gridX * CLASS_CELL_SIZE,
          origY: node.gridY * CLASS_CELL_SIZE,
        };
      } else {
        pendingPointerRef.current = {
          element: e.currentTarget as HTMLElement,
          pointerId: e.pointerId,
          nodeId: node.id,
          clientX: e.clientX,
          clientY: e.clientY,
        };
      }
    } else {
      e.preventDefault();
      e.stopPropagation();
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
      draggingRef.current = {
        nodeId: node.id,
        startX: e.clientX,
        startY: e.clientY,
        origX: node.gridX * CLASS_CELL_SIZE,
        origY: node.gridY * CLASS_CELL_SIZE,
      };
    }
  };

  const handleNodePointerCancel = () => {
    pendingPointerRef.current = null;
    draggingRef.current = null;
    setDragOffset(null);
    touchPanningRefClass.current = false;
  };

  const handleNodePointerMove = (e: React.PointerEvent) => {
    if (pendingPointerRef.current && !touchPanningRefClass.current) {
      const dx = Math.abs(e.clientX - pendingPointerRef.current.clientX);
      const dy = Math.abs(e.clientY - pendingPointerRef.current.clientY);
      if (dx > 10 || dy > 10) {
        suppressClickRefClass.current = true;
        touchPanningRefClass.current = true;
        panStartRef.current = {
          pointerX: pendingPointerRef.current.clientX,
          pointerY: pendingPointerRef.current.clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
        };
        pendingPointerRef.current = null;
      }
      return;
    }

    if (touchPanningRefClass.current && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.pointerX;
      const dy = e.clientY - panStartRef.current.pointerY;
      const newPan = { x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy };
      panRef.current = newPan;
      motionX.set(newPan.x);
      motionY.set(newPan.y);
      return;
    }

    if (!draggingRef.current) return;
    suppressClickRefClass.current = true;
    const zoom = zoomRef.current;
    const dx = (e.clientX - draggingRef.current.startX) / zoom;
    const dy = (e.clientY - draggingRef.current.startY) / zoom;
    setDragOffset({ id: draggingRef.current.nodeId, dx, dy });
  };

  const handleNodePointerUp = (node: any, e: React.PointerEvent) => {
    if (pendingPointerRef.current) {
      pendingPointerRef.current = null;
    }

    if (touchPanningRefClass.current) {
      touchPanningRefClass.current = false;
      panStartRef.current = null;
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
      return;
    }

    if (!draggingRef.current || draggingRef.current.nodeId !== node.id) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
      return;
    }
    const zoom = zoomRef.current;
    const dx = (e.clientX - draggingRef.current.startX) / zoom;
    const dy = (e.clientY - draggingRef.current.startY) / zoom;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      const newX = draggingRef.current.origX + dx;
      const newY = draggingRef.current.origY + dy;
      setPendingDragUpdates(prev => new Map(prev).set(node.id, { dx, dy }));
      updateNodeMutation.mutate({
        nodeId: node.id,
        data: { gridX: Math.round(newX / CLASS_CELL_SIZE), gridY: Math.round(newY / CLASS_CELL_SIZE) },
      });
    } else {
      setDragOffset(null);
    }
    draggingRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  };

  const suppressClickRefClass = useRef(false);

  const handleNodeClick = (node: any, e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    if (suppressClickRefClass.current) {
      suppressClickRefClass.current = false;
      return;
    }
    if (connectingFrom !== null) {
      if (connectingFrom === '__waiting__' || connectingFrom === '') {
        setConnectingFrom(node.id);
      } else if (connectingFrom !== node.id) {
        createConnectionMutation.mutate({ fromNodeId: connectingFrom, toNodeId: node.id });
        setConnectingFrom('__waiting__');
      } else {
        setConnectingFrom('__waiting__');
      }
    } else {
      setSelectedNodeId(node.id);
    }
  };

  const handleNodeDoubleClick = (node: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setNodeActionMenu(node.id);
    setSelectedNodeId(node.id);
  };

  const handleNodeContextMenu = (node: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setNodeActionMenu(node.id);
    setSelectedNodeId(node.id);
  };

  const handleClassCanvasClick = () => {
    if (!draggingRef.current) {
      setSelectedNodeId(null);
      if (connectingFrom) setConnectingFrom(null);
    }
    setNodeActionMenu(null);
  };

  const handleAddNode = () => {
    if (!selectedClassId) return;
    const zoom = zoomRef.current;
    const pan = panRef.current;
    const container = canvasContainerRef.current;
    const rect = container?.getBoundingClientRect();
    const vw = rect?.width || viewportSize.width || 800;
    const vh = rect?.height || viewportSize.height || 600;
    const centerX = Math.round((vw / 2 - pan.x) / zoom);
    const centerY = Math.round((vh / 2 - pan.y) / zoom);
    setEditingNode({
      gridX: Math.round(centerX / CLASS_CELL_SIZE),
      gridY: Math.round(centerY / CLASS_CELL_SIZE),
      tier: 1,
      cost: 1,
      effects: [],
    });
    setShowNodeEditor(true);
  };

  const handleDuplicateNode = (node: any) => {
    if (!selectedClassId) return;
    const zoom = zoomRef.current;
    const pan = panRef.current;
    const container = canvasContainerRef.current;
    const rect = container?.getBoundingClientRect();
    const vw = rect?.width || viewportSize.width || 800;
    const vh = rect?.height || viewportSize.height || 600;
    const centerX = Math.round((vw / 2 - pan.x) / zoom);
    const centerY = Math.round((vh / 2 - pan.y) / zoom);

    createNodeMutation.mutate({
      name: node.name + ' (Copy)',
      description: node.description || undefined,
      icon: node.icon || undefined,
      image: node.image || undefined,
      gridX: Math.round(centerX / CLASS_CELL_SIZE) + 1,
      gridY: Math.round(centerY / CLASS_CELL_SIZE),
      tier: node.tier || 1,
      cost: node.cost || 1,
      effects: node.effects || [],
    });
  };

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setViewportSize(prev => prev.width !== rect.width || prev.height !== rect.height ? { width: rect.width, height: rect.height } : prev);
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setViewportSize(prev => prev.width !== width || prev.height !== height ? { width, height } : prev);
        }
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [selectedClassId]);

  useEffect(() => {
    if (selectedClassId && viewportSize.width > 0) {
      const centerX = viewportSize.width / 2;
      const centerY = viewportSize.height / 2;
      panRef.current = { x: centerX, y: centerY };
      zoomRef.current = 1;
      motionX.set(centerX);
      motionY.set(centerY);
      motionZoom.set(1);
      forceUpdate(n => n + 1);
    }
  }, [selectedClassId, viewportSize.width]);

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container || !selectedClassId) return;
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
        const worldX = ((mouseX + CLASS_WORLD_OFFSET - currentPan.x) / currentZoom) - CLASS_WORLD_OFFSET;
        const worldY = ((mouseY + CLASS_WORLD_OFFSET - currentPan.y) / currentZoom) - CLASS_WORLD_OFFSET;
        const newPan = {
          x: mouseX + CLASS_WORLD_OFFSET - (worldX + CLASS_WORLD_OFFSET) * newZoom,
          y: mouseY + CLASS_WORLD_OFFSET - (worldY + CLASS_WORLD_OFFSET) * newZoom
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
  }, [selectedClassId, viewportSize.width, motionX, motionY, motionZoom]);

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container || !selectedClassId) return;
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        if (gestureModeRef.current === 'panning') { gestureModeRef.current = 'idle'; panPointerIdRef.current = null; panStartRef.current = null; }
        gestureModeRef.current = 'pinching';
        setIsPinching(true);
      } else if (e.touches.length === 1) { setIsPinching(false); }
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        gestureModeRef.current = 'pinching';
        setIsPinching(true);
        const currentZoom = zoomRef.current;
        const currentPan = panRef.current;
        const t1 = e.touches[0]; const t2 = e.touches[1];
        const distance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const rect = container.getBoundingClientRect();
        const centerX = ((t1.clientX + t2.clientX) / 2) - rect.left;
        const centerY = ((t1.clientY + t2.clientY) / 2) - rect.top;
        if (lastTouchDistanceRef.current !== null) {
          const delta = (distance - lastTouchDistanceRef.current) * 0.01;
          const newZoom = Math.max(0.3, Math.min(3, currentZoom + delta));
          if (Math.abs(newZoom - currentZoom) > 0.001) {
            const worldX = ((centerX + CLASS_WORLD_OFFSET - currentPan.x) / currentZoom) - CLASS_WORLD_OFFSET;
            const worldY = ((centerY + CLASS_WORLD_OFFSET - currentPan.y) / currentZoom) - CLASS_WORLD_OFFSET;
            const newPan = {
              x: centerX + CLASS_WORLD_OFFSET - (worldX + CLASS_WORLD_OFFSET) * newZoom,
              y: centerY + CLASS_WORLD_OFFSET - (worldY + CLASS_WORLD_OFFSET) * newZoom
            };
            panRef.current = newPan;
            zoomRef.current = newZoom;
            motionX.set(newPan.x); motionY.set(newPan.y); motionZoom.set(newZoom);
            forceUpdate(n => n + 1);
          }
        }
        lastTouchDistanceRef.current = distance;
      }
    };
    const handleTouchEnd = () => {
      lastTouchDistanceRef.current = null;
      if (gestureModeRef.current === 'pinching') { gestureModeRef.current = 'idle'; setIsPinching(false); }
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
  }, [selectedClassId, viewportSize.width]);

  const handleClassCanvasPointerDown = (e: React.PointerEvent) => {
    if (isPinching) return;
    if (gestureModeRef.current !== 'idle') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-connection-delete]')) return;
    if (e.pointerType !== 'touch' && target.closest('[data-node-cell]')) return;
    gestureModeRef.current = 'panning';
    panPointerIdRef.current = e.pointerId;
    panStartRef.current = { pointerX: e.clientX, pointerY: e.clientY, panX: panRef.current.x, panY: panRef.current.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleClassCanvasPointerMove = (e: React.PointerEvent) => {
    if (gestureModeRef.current !== 'panning') return;
    if (panPointerIdRef.current !== e.pointerId) return;
    if (!panStartRef.current) return;
    const dx = e.clientX - panStartRef.current.pointerX;
    const dy = e.clientY - panStartRef.current.pointerY;
    const newPan = { x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy };
    panRef.current = newPan;
    motionX.set(newPan.x);
    motionY.set(newPan.y);
  };

  const handleClassCanvasPointerUp = (e: React.PointerEvent) => {
    if (panPointerIdRef.current === e.pointerId) {
      gestureModeRef.current = 'idle';
      panPointerIdRef.current = null;
      panStartRef.current = null;
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    }
  };

  const generateClassCurvePath = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const minOffset = 40;
    const curvature = Math.max(minOffset, Math.min(distance * 0.3, 100));
    const horizontalOffset = Math.abs(dx) < 10 ? minOffset : dx * 0.25;
    const verticalOffset = curvature * (dy >= 0 ? 0.5 : -0.5);
    const cx1 = x1 + horizontalOffset;
    const cy1 = y1 + verticalOffset;
    const cx2 = x2 - horizontalOffset;
    const cy2 = y2 - verticalOffset;
    return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
  };

  if (!selectedClassId) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium text-stone-300">Classes</h3>
          <Button onClick={() => setShowAddClass(true)} className="bg-fuchsia-700 hover:bg-fuchsia-600" data-testid="button-add-class">
            <Plus className="h-4 w-4 mr-1" /> Add Class
          </Button>
        </div>

        {isLoading ? (
          <p className="text-stone-400">Loading...</p>
        ) : classes.length === 0 ? (
          <p className="text-stone-500">No classes created yet. Add one to get started.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map((cls: any) => (
              <Card key={cls.id} className="bg-stone-900 border-stone-700 hover:border-fuchsia-600 transition-colors cursor-pointer" onClick={() => setSelectedClassId(cls.id)} data-testid={`card-class-${cls.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      {cls.image ? (
                        <img src={cls.image} alt={cls.name} className="w-8 h-8 rounded object-cover border border-fuchsia-600" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-fuchsia-900/40 border border-fuchsia-700 flex items-center justify-center">
                          <Layers className="h-4 w-4 text-fuchsia-500" />
                        </div>
                      )}
                      <CardTitle className="text-fuchsia-400">{cls.name}</CardTitle>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditingClass(cls); setClassName(cls.name); setClassDesc(cls.description || ''); setClassImage(cls.image || ''); setClassSkillTreeId(cls.skillTreeId || ''); setClassApplyToAll(!!cls.applyToAll); }} data-testid={`button-edit-class-${cls.id}`}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-400" onClick={(e) => { e.stopPropagation(); deleteClassMutation.mutate(cls.id); }} data-testid={`button-delete-class-${cls.id}`}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <CardDescription className="text-stone-400">{cls.description || 'No description'}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={showAddClass || !!editingClass} onOpenChange={(open) => { if (!open) { setShowAddClass(false); setEditingClass(null); setClassName(''); setClassDesc(''); setClassImage(''); setClassSkillTreeId(''); setClassApplyToAll(false); } }}>
          <DialogContent className="bg-stone-900 border-stone-700">
            <DialogHeader>
              <DialogTitle className="text-fuchsia-400">{editingClass ? 'Edit Class' : 'New Class'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-stone-300">Name</Label>
                <Input value={className} onChange={(e) => setClassName(e.target.value)} className="bg-stone-800 border-stone-700" data-testid="input-class-name" />
              </div>
              <div>
                <Label className="text-stone-300">Description</Label>
                <Textarea value={classDesc} onChange={(e) => setClassDesc(e.target.value)} className="bg-stone-800 border-stone-700" data-testid="input-class-description" />
              </div>
              <div>
                <Label className="text-stone-300">Class Icon</Label>
                <div className="flex items-center gap-3 mt-1">
                  {classImage ? (
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-fuchsia-600">
                      <img src={classImage} alt="Class icon" className="w-full h-full object-cover" />
                      <button onClick={() => setClassImage('')} className="absolute top-0 right-0 bg-red-600 rounded-bl p-0.5">
                        <X className="h-3 w-3 text-white" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-lg border border-stone-700 bg-stone-800 flex items-center justify-center">
                      <ImageIcon className="h-6 w-6 text-stone-500" />
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    <Button size="sm" variant="outline" className="text-xs" onClick={() => setShowClassImageBrowser(true)} data-testid="button-browse-class-image">
                      <ImageIcon className="h-3 w-3 mr-1" /> Browse
                    </Button>
                    <input ref={classImageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => setClassImage(ev.target?.result as string);
                        reader.readAsDataURL(file);
                      }
                    }} />
                    <Button size="sm" variant="outline" className="text-xs" onClick={() => classImageInputRef.current?.click()} data-testid="button-upload-class-image">
                      <Upload className="h-3 w-3 mr-1" /> Upload
                    </Button>
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-stone-300">Skill Tree</Label>
                <Select 
                  value={classSkillTreeId || "_none"} 
                  onValueChange={(value) => setClassSkillTreeId(value === "_none" ? "" : value)}
                >
                  <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-class-skilltree">
                    <SelectValue placeholder="Select a skill tree..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {skillTreesForClasses.map((tree: any) => (
                      <SelectItem key={tree.id} value={tree.id}>
                        {tree.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {effectiveClassSystem === 'aa-v3' && !personal && (
                <div className="flex items-start gap-3 rounded-md border border-stone-700 bg-stone-800/60 p-3">
                  <Checkbox
                    id="class-apply-to-all"
                    checked={classApplyToAll}
                    onCheckedChange={(v) => setClassApplyToAll(v === true)}
                    className="mt-0.5"
                    data-testid="checkbox-class-apply-to-all"
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor="class-apply-to-all" className="text-stone-300 cursor-pointer">Apply to everyone</Label>
                    <p className="text-xs text-stone-500">Automatically give this class to every V3 character. Turning this on also adds it to existing characters; turning it off leaves them as-is.</p>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowAddClass(false); setEditingClass(null); }}>Cancel</Button>
              <Button className="bg-fuchsia-700 hover:bg-fuchsia-600" onClick={() => {
                if (editingClass) {
                  updateClassMutation.mutate({ id: editingClass.id, data: { name: className, description: classDesc, image: classImage || null, skillTreeId: classSkillTreeId || null, ...(effectiveClassSystem === 'aa-v3' ? { applyToAll: classApplyToAll } : {}) } });
                } else {
                  createClassMutation.mutate({ name: className, description: classDesc, ...(effectiveClassSystem === 'aa-v3' ? { applyToAll: classApplyToAll } : {}) });
                }
              }} data-testid="button-save-class">
                {editingClass ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ImageBrowser
          open={showClassImageBrowser}
          onOpenChange={setShowClassImageBrowser}
          onSelect={(url: string) => { setClassImage(url); setShowClassImageBrowser(false); }}
        />
      </div>
    );
  }

  const selectedClass = classes.find((c: any) => c.id === selectedClassId);
  const nodeById = new Map<string, any>();
  nodes.forEach((n: any) => nodeById.set(n.id, n));

  const connectionMode = connectingFrom !== null;
  const getNodeDescription = (node: any) => {
    if (node.description) return node.description;
    if (Array.isArray(node.effects) && node.effects.length > 0) {
      return node.effects.map((e: any) => `${e.type.replace(/_/g, ' ')}: +${e.value}${e.attribute ? ` (${e.attribute})` : ''}`).join(', ');
    }
    return undefined;
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="ghost" size="sm" onClick={() => setSelectedClassId(null)} data-testid="button-back-classes">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h3 className="text-lg font-medium text-fuchsia-400">{selectedClass?.name} — Skill Tree</h3>
      </div>

      <div className="flex flex-wrap gap-2 items-center shrink-0">
        <Button
          size="sm"
          onClick={handleAddNode}
          className="bg-fuchsia-600 hover:bg-fuchsia-700 text-xs"
          data-testid="button-add-node"
        >
          <Plus className="h-3 w-3 mr-1" />
          Add Skill
        </Button>
        <Button
          size="sm"
          variant={connectionMode ? "default" : "secondary"}
          onClick={() => {
            if (connectionMode) { setConnectingFrom(null); } else { setConnectingFrom('__waiting__'); }
          }}
          className={connectionMode
            ? "bg-fuchsia-600 hover:bg-fuchsia-700 text-xs animate-pulse"
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
          onClick={() => {
            if (viewportSize.width > 0) {
              const centerX = viewportSize.width / 2;
              const centerY = viewportSize.height / 2;
              panRef.current = { x: centerX, y: centerY };
              zoomRef.current = 1;
              motionX.set(centerX); motionY.set(centerY); motionZoom.set(1);
              forceUpdate(n => n + 1);
            }
          }}
          title="Reset to default view"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Reset View
        </Button>
        {connectionMode && (
          <div className="flex items-center gap-2 bg-fuchsia-600/90 backdrop-blur px-3 py-1.5 rounded-lg text-sm shadow-lg ml-auto">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <span>{connectingFrom && connectingFrom !== '__waiting__' ? 'Click target skill to connect' : 'Click source skill to start'}</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 hover:bg-fuchsia-500"
              onClick={() => setConnectingFrom(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div
        ref={canvasContainerRef}
        className={`relative w-full overflow-hidden rounded-lg border border-stone-700 ${
          connectionMode ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
        }`}
        style={{
          height: 'calc(100vh - 280px)',
          minHeight: '400px',
          touchAction: 'none',
          background: 'radial-gradient(ellipse at center, #1c1917 0%, #0c0a09 100%)',
          userSelect: 'none',
          WebkitUserSelect: 'none'
        }}
        onPointerDown={handleClassCanvasPointerDown}
        onPointerMove={handleClassCanvasPointerMove}
        onPointerUp={handleClassCanvasPointerUp}
        onPointerCancel={handleClassCanvasPointerUp}
        onClick={handleClassCanvasClick}
        data-testid="class-skill-tree-canvas"
      >
        <motion.div
          className="absolute"
          style={{
            x: motionX,
            y: motionY,
            scale: motionZoom,
            width: CLASS_WORLD_SIZE,
            height: CLASS_WORLD_SIZE,
            left: -CLASS_WORLD_OFFSET,
            top: -CLASS_WORLD_OFFSET,
            transformOrigin: '0 0'
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none opacity-30"
            style={{
              backgroundImage: `
                radial-gradient(circle at center, rgba(217,70,239,0.1) 0%, transparent 70%),
                linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
              `,
              backgroundSize: `100% 100%, 50px 50px, 50px 50px`,
              backgroundPosition: `center, ${CLASS_WORLD_OFFSET}px ${CLASS_WORLD_OFFSET}px, ${CLASS_WORLD_OFFSET}px ${CLASS_WORLD_OFFSET}px`
            }}
          />

          <svg
            className="absolute"
            style={{ width: CLASS_WORLD_SIZE, height: CLASS_WORLD_SIZE, left: 0, top: 0 }}
          >
            <defs>
              <marker id="arrowhead-class" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto">
                <polygon points="0 0, 12 4, 0 8" fill="url(#class-arrow-gradient)" />
              </marker>
              <linearGradient id="class-arrow-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#d946ef" />
                <stop offset="100%" stopColor="#eab308" />
              </linearGradient>
              <linearGradient id="class-line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#d946ef" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#eab308" stopOpacity="0.8" />
              </linearGradient>
              <filter id="class-glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            {connections.map((conn: any) => {
              const from = nodeById.get(conn.fromNodeId);
              const to = nodeById.get(conn.toNodeId);
              if (!from || !to) return null;

              let fromX = from.gridX * CLASS_CELL_SIZE;
              let fromY = from.gridY * CLASS_CELL_SIZE;
              let toX = to.gridX * CLASS_CELL_SIZE;
              let toY = to.gridY * CLASS_CELL_SIZE;

              const fromPending = pendingDragUpdates.get(from.id);
              const toPending = pendingDragUpdates.get(to.id);
              if (dragOffset?.id === from.id) { fromX += dragOffset.dx; fromY += dragOffset.dy; }
              else if (fromPending) { fromX += fromPending.dx; fromY += fromPending.dy; }
              if (dragOffset?.id === to.id) { toX += dragOffset.dx; toY += dragOffset.dy; }
              else if (toPending) { toX += toPending.dx; toY += toPending.dy; }

              const x1 = CLASS_WORLD_OFFSET + fromX + CLASS_NODE_WIDTH / 2;
              const y1 = CLASS_WORLD_OFFSET + fromY + CLASS_NODE_CIRCLE_CENTER_Y;
              const x2 = CLASS_WORLD_OFFSET + toX + CLASS_NODE_WIDTH / 2;
              const y2 = CLASS_WORLD_OFFSET + toY + CLASS_NODE_CIRCLE_CENTER_Y;
              const pathD = generateClassCurvePath(x1, y1, x2, y2);
              const midX = (x1 + x2) / 2;
              const midY = (y1 + y2) / 2;

              return (
                <g key={conn.id} filter="url(#class-glow)">
                  <path
                    d={pathD}
                    fill="none"
                    stroke="url(#class-line-gradient)"
                    strokeWidth={3}
                    markerEnd="url(#arrowhead-class)"
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
                    {'\u00d7'}
                  </text>
                </g>
              );
            })}
          </svg>

          {nodes.map((node: any) => {
            const isSelected = selectedNodeId === node.id;
            const isConnectSource = connectingFrom === node.id;
            const isDragging = dragOffset?.id === node.id;
            const nodeImg = getNodeImage(node);
            const style = classTierStyles[node.tier] || classTierStyles[1];

            let posX = node.gridX * CLASS_CELL_SIZE;
            let posY = node.gridY * CLASS_CELL_SIZE;
            if (isDragging && dragOffset) { posX += dragOffset.dx; posY += dragOffset.dy; }

            return (
              <div
                key={node.id}
                data-node-cell
                className={`absolute flex flex-col items-center ${connectionMode ? 'cursor-crosshair' : 'cursor-move'}`}
                style={{
                  left: CLASS_WORLD_OFFSET + posX,
                  top: CLASS_WORLD_OFFSET + posY,
                  width: CLASS_NODE_WIDTH,
                  height: CLASS_NODE_HEIGHT,
                  willChange: isDragging ? 'left, top' : 'auto',
                }}
                onClick={(e) => handleNodeClick(node, e)}
                onDoubleClick={(e) => handleNodeDoubleClick(node, e)}
                onContextMenu={(e) => handleNodeContextMenu(node, e)}
                onPointerDown={(e) => handleNodePointerDown(node, e)}
                onPointerMove={handleNodePointerMove}
                onPointerUp={(e) => handleNodePointerUp(node, e)}
                onPointerCancel={handleNodePointerCancel}
                onDragStart={(e) => e.preventDefault()}
                data-testid={`class-node-${node.id}`}
              >
                <div
                  className={`rounded-full border-[3px] overflow-hidden transition-all shrink-0
                    ${style.border} ${style.glow}
                    ${isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-stone-900 scale-105' : ''}
                    ${isConnectSource ? 'animate-pulse ring-2 ring-fuchsia-400' : ''}
                    ${longPressId === node.id ? 'ring-2 ring-amber-400 scale-110' : ''}
                    ${!isDragging ? 'hover:scale-105' : ''}
                  `}
                  style={{ width: CLASS_NODE_CIRCLE_SIZE, height: CLASS_NODE_CIRCLE_SIZE }}
                >
                  {nodeImg ? (
                    <img src={nodeImg} alt={node.name} className="w-full h-full object-cover" draggable={false} />
                  ) : (
                    <div className={`w-full h-full flex items-center justify-center text-center p-1 ${style.bg}`}>
                      <span className="text-[10px] font-bold text-white leading-tight">{node.name}</span>
                    </div>
                  )}
                </div>
                <div className="text-[10px] font-semibold text-center mt-1 max-w-[90px] truncate text-fuchsia-300">
                  {node.name}
                </div>
              </div>
            );
          })}

          <div
            className="absolute w-4 h-4 bg-fuchsia-500/50 rounded-full border-2 border-fuchsia-400"
            style={{ left: CLASS_WORLD_OFFSET - 8, top: CLASS_WORLD_OFFSET - 8 }}
            title="Origin (0,0)"
          />
        </motion.div>
      </div>

      {nodeActionMenu && (() => {
        const actionNode = nodes.find((n: any) => n.id === nodeActionMenu);
        if (!actionNode) return null;
        const desc = getNodeDescription(actionNode);
        return (
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60"
            onClick={() => setNodeActionMenu(null)}
          >
            <div
              className="bg-stone-800 border border-stone-600 rounded-xl shadow-2xl p-4 min-w-[220px] transform"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-4">
                <h3 className="font-display text-lg text-amber-500">
                  {actionNode.name || 'Skill Actions'}
                </h3>
                {desc && (
                  <p className="text-xs text-stone-400 mt-1 line-clamp-2">{desc}</p>
                )}
              </div>

              <div className="space-y-2">
                <button
                  className="w-full px-4 py-3 rounded-lg bg-stone-700 hover:bg-fuchsia-700 transition-colors flex items-center gap-3 text-stone-200"
                  onClick={() => {
                    setEditingNode(actionNode);
                    setShowNodeEditor(true);
                    setNodeActionMenu(null);
                  }}
                  data-testid="button-edit-node"
                >
                  <Pencil className="h-5 w-5 text-fuchsia-400" />
                  <span>Edit Skill</span>
                </button>

                <button
                  className="w-full px-4 py-3 rounded-lg bg-stone-700 hover:bg-blue-700 transition-colors flex items-center gap-3 text-stone-200"
                  onClick={() => {
                    setConnectingFrom(actionNode.id);
                    setNodeActionMenu(null);
                  }}
                  data-testid="button-connect-node"
                >
                  <Link className="h-5 w-5 text-blue-400" />
                  <span>Start Connection</span>
                </button>

                <button
                  className="w-full px-4 py-3 rounded-lg bg-stone-700 hover:bg-green-700 transition-colors flex items-center gap-3 text-stone-200"
                  onClick={() => {
                    handleDuplicateNode(actionNode);
                    setNodeActionMenu(null);
                  }}
                  data-testid="button-duplicate-node"
                >
                  <Copy className="h-5 w-5 text-green-400" />
                  <span>Duplicate Skill</span>
                </button>

                <div className="border-t border-stone-600 my-2" />

                <button
                  className="w-full px-4 py-3 rounded-lg bg-red-900/30 hover:bg-red-700 transition-colors flex items-center gap-3 text-red-400 hover:text-white"
                  onClick={() => {
                    if (confirm('Delete this skill? This cannot be undone.')) {
                      deleteNodeMutation.mutate(actionNode.id);
                    }
                    setNodeActionMenu(null);
                  }}
                  data-testid="button-delete-node"
                >
                  <Trash2 className="h-5 w-5" />
                  <span>Delete Skill</span>
                </button>
              </div>

              <button
                className="w-full mt-4 px-4 py-2 rounded-lg border border-stone-600 hover:bg-stone-700 transition-colors text-stone-400 text-sm"
                onClick={() => setNodeActionMenu(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        );
      })()}

      <ClassNodeEditorDialog
        open={showNodeEditor}
        onOpenChange={(open) => { setShowNodeEditor(open); if (!open) setEditingNode(null); }}
        node={editingNode}
        onSave={(data) => {
          if (editingNode?.id) {
            updateNodeMutation.mutate({ nodeId: editingNode.id, data });
          } else {
            createNodeMutation.mutate({
              ...data,
              gridX: editingNode?.gridX ?? 0,
              gridY: editingNode?.gridY ?? 0,
            });
          }
          setShowNodeEditor(false);
          setEditingNode(null);
        }}
        personal={personal}
      />
    </div>
  );
}

function ClassNodeEditorDialog({ open, onOpenChange, node, onSave, personal }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: any;
  onSave: (data: any) => void;
  personal?: boolean;
}) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    image: '',
    tier: 1,
    cost: 1,
    effects: [] as any[],
  });
  const [showNodeImageBrowser, setShowNodeImageBrowser] = useState(false);

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

  const [showSpellPicker, setShowSpellPicker] = useState(false);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [showTraitPicker, setShowTraitPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  // class-node effect picker still scopes to AA V2 library for now; V3 will
  // share-or-fork in a later task. Mirror V2 by keeping the picker on V2.
  const systemSlug = 'aa-v2';

  const { data: systemSpells = [] } = useQuery({
    queryKey: ['admin-spells', systemSlug],
    queryFn: () => api.getSystemSpells(systemSlug),
    enabled: open,
  });

  const { data: customSkills = [] } = useQuery({
    queryKey: ['admin-skills', systemSlug],
    queryFn: () => api.getSystemSkills(systemSlug),
    enabled: open,
  });

  const { data: systemItems = [] } = useQuery<any[]>({
    queryKey: ['/api/system-items', systemSlug, personal],
    queryFn: () => fetch(`/api/system-items?system=${systemSlug}${personal ? '&personal=1' : ''}`, { credentials: 'include' }).then(r => r.json()),
    enabled: open,
  });

  const { data: systemTraitsForDropdown = [] } = useQuery({
    queryKey: ['admin-traits', systemSlug],
    queryFn: () => api.getSystemTraits(systemSlug),
    enabled: open,
  });

  const normalizeEffects = (effects: any[] | undefined): any[] => {
    if (!effects) return [];
    return effects.map((effect: any) => ({ ...effect }));
  };

  useEffect(() => {
    if (node) {
      setFormData({
        name: node.name || '',
        description: node.description || '',
        image: node.image || '',
        tier: node.tier || 1,
        cost: node.cost || 1,
        effects: normalizeEffects(node.effects),
      });
    } else {
      setFormData(prev => ({
        ...prev,
        name: '',
        description: '',
        image: '',
        effects: [],
      }));
    }
  }, [node, open]);

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ title: 'Error', description: 'Skill name is required', variant: 'destructive' });
      return;
    }
    onSave({ ...formData, image: formData.image || null });
  };

  const addEffect = () => {
    const requiresValue = newEffect.type !== 'spell_grant' &&
                          newEffect.type !== 'item_grant' &&
                          newEffect.type !== 'skill_grant' &&
                          newEffect.type !== 'trait_grant' &&
                          !(newEffect.type === 'hp_bonus' && newEffect.target);
    if (requiresValue && newEffect.value === 0) {
      toast({ title: 'Error', description: 'Effect value cannot be 0', variant: 'destructive' });
      return;
    }
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
          <DialogTitle className="text-fuchsia-400 flex items-center gap-2">
            {node?.id ? 'Edit Skill Node' : 'Add Skill Node'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Power Strike"
              className="bg-stone-800 border-stone-700"
              data-testid="input-node-name"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe what this skill does"
              className="bg-stone-800 border-stone-700"
              data-testid="input-node-description"
            />
          </div>
          <div>
            <Label className="text-xs text-stone-400">Node Image</Label>
            <div className="flex items-center gap-3 mt-1">
              {formData.image ? (
                <div className="relative">
                  <img src={formData.image} alt="" className="h-14 w-14 rounded-full object-cover border-2 border-fuchsia-500" />
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, image: '' })}
                    className="absolute -top-1 -right-1 bg-red-600 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
              ) : (
                <div className="h-14 w-14 rounded-full bg-stone-700 border-2 border-dashed border-stone-500 flex items-center justify-center">
                  <ImageIcon className="h-5 w-5 text-stone-500" />
                </div>
              )}
              <div className="flex flex-col gap-1">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowNodeImageBrowser(true)} className="text-xs">
                  Browse Images
                </Button>
                <Input
                  value={formData.image}
                  onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                  placeholder="Or paste image URL"
                  className="bg-stone-800 border-stone-700 text-xs h-7"
                />
              </div>
            </div>
            <ImageBrowser
              open={showNodeImageBrowser}
              onOpenChange={setShowNodeImageBrowser}
              onSelect={(url) => {
                setFormData({ ...formData, image: url });
                setShowNodeImageBrowser(false);
              }}
            />
          </div>
          <div>
            <Label>Cost (skill points)</Label>
            <Input
              type="number"
              min={1}
              max={10}
              value={formData.cost}
              onChange={(e) => setFormData({ ...formData, cost: parseInt(e.target.value) || 1 })}
              className="bg-stone-800 border-stone-700"
              data-testid="input-node-cost"
            />
          </div>

          <div className="border-t border-stone-700 pt-4">
            <Label className="text-base font-semibold">Effects</Label>
            <div className="mt-2 space-y-2">
              {(formData.effects || []).map((effect: any, idx: number) => {
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
                    const hasLegacyTarget = !effect.subtype && target && target !== '';
                    if (hasLegacyTarget) {
                      return `HP: ${target}`;
                    }
                    return `+${value} HP${subtypeLabel}`;
                  }
                  if (effect.type === 'energy_bonus' || effect.type === 'energy_increase') {
                    const subtypeLabel = effect.subtype === 'per_level' ? '/level' : '';
                    return `+${value} Energy${subtypeLabel}`;
                  }
                  if (effect.type === 'mana_increase') {
                    const subtypeLabel = effect.subtype === 'per_level' ? '/level' : '';
                    return `+${value} Mana${subtypeLabel}`;
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
                    onValueChange={(v) => setNewEffect({ ...newEffect, type: v, target: '', subtype: (v === 'hp_bonus' || v === 'energy_bonus' || v === 'energy_increase' || v === 'mana_increase') ? 'flat' : undefined })}
                  >
                    <SelectTrigger className="bg-stone-800 border-stone-700 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hp_bonus">HP Bonus</SelectItem>
                      <SelectItem value="energy_increase">Energy Bonus</SelectItem>
                      <SelectItem value="mana_increase">Mana Increase</SelectItem>
                      <SelectItem value="dc_bonus">DC Bonus</SelectItem>
                      <SelectItem value="skill_bonus">Skill Bonus</SelectItem>
                      <SelectItem value="attribute_bonus">Attribute Bonus</SelectItem>
                      <SelectItem value="spell_grant">Grant Spell</SelectItem>
                      <SelectItem value="item_grant">Grant Item</SelectItem>
                      <SelectItem value="skill_grant">Grant Custom Skill</SelectItem>
                      <SelectItem value="trait_grant">Grant Trait</SelectItem>
                    </SelectContent>
                  </Select>

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

                {(newEffect.type === 'hp_bonus' || newEffect.type === 'energy_bonus' || newEffect.type === 'energy_increase' || newEffect.type === 'mana_increase') && (
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
                        ? `Adds ${newEffect.type === 'hp_bonus' ? 'HP' : newEffect.type === 'mana_increase' ? 'Mana' : 'Energy'} each level`
                        : `One-time ${newEffect.type === 'hp_bonus' ? 'HP' : newEffect.type === 'mana_increase' ? 'Mana' : 'Energy'} boost`}
                    </span>
                  </div>
                )}

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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="bg-fuchsia-700 hover:bg-fuchsia-600"
            onClick={handleSubmit}
            data-testid="button-save-node"
          >
            {node?.id ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// CRAFTER RECIPE TEMPLATES (AA V2 only)
// ============================================================

function CrafterRecipeTemplatesView({ systemSlug, personal }: { systemSlug: string; personal?: boolean }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');

  const { data: templates = [], isLoading } = useQuery<any[]>({
    queryKey: ['crafter-recipe-templates', systemSlug, personal],
    queryFn: () => api.listCrafterRecipeTemplates(systemSlug, personal),
    enabled: systemSlug === 'aa-v2' || systemSlug === 'aa-v3',
  });

  const createMut = useMutation({
    mutationFn: (data: any) => api.createCrafterRecipeTemplate({ ...data, system: systemSlug, ...(personal ? { personal: true } : {}) }),
    onSuccess: (created: any) => {
      queryClient.invalidateQueries({ queryKey: ['crafter-recipe-templates'] });
      setCreating(false);
      setEditingId(created.id);
    },
    onError: (err: any) => toast({ title: 'Create failed', description: err?.message || String(err), variant: 'destructive' }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteCrafterRecipeTemplate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crafter-recipe-templates'] }),
    onError: (err: any) => toast({ title: 'Delete failed', description: err?.message || String(err), variant: 'destructive' }),
  });

  if (systemSlug !== 'aa-v2' && systemSlug !== 'aa-v3') {
    return (
      <Card className="bg-stone-900 border-stone-700">
        <CardContent className="py-12 text-center text-stone-400">
          Crafter Recipe Templates are an A.A. V2 / V3 feature.
        </CardContent>
      </Card>
    );
  }

  const filtered = (templates || []).filter((t: any) => !search || t.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <Card className="bg-stone-900 border-stone-700 flex-1 flex flex-col min-h-0">
      <CardHeader className="flex flex-row items-center justify-between shrink-0">
        <div>
          <CardTitle className="text-amber-500">Crafter Recipe Templates</CardTitle>
          <CardDescription className="text-stone-400 mt-1">
            Build a shared recipe list, then link the template to any crafter item. Edits to a template's recipes propagate to every linked crafter automatically.
          </CardDescription>
        </div>
        <Button onClick={() => setCreating(true)} className="bg-amber-700 hover:bg-amber-600" data-testid="button-add-crafter-template">
          <Plus className="h-4 w-4 mr-2" /> New Template
        </Button>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0">
        <div className="mb-4 shrink-0 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
          <Input
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-stone-800 border-stone-700"
            data-testid="input-search-crafter-templates"
          />
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-stone-400">Loading templates...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-stone-400">
            <Hammer className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-bold">No crafter recipe templates yet</p>
            <p className="text-sm mt-2">Create one and start adding recipes.</p>
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-2">
              {filtered.map((t: any) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-stone-800 border border-stone-700 hover:border-stone-600"
                  data-testid={`crafter-template-row-${t.id}`}
                >
                  <Hammer className="h-5 w-5 text-amber-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm sm:text-base" data-testid={`text-crafter-template-name-${t.id}`}>{t.name}</span>
                      <Badge className="bg-amber-700/30 text-amber-300 text-xs border border-amber-700/50">Template</Badge>
                    </div>
                    {t.description && <div className="text-xs text-stone-400 mt-0.5 line-clamp-1">{t.description}</div>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => setEditingId(t.id)} className="text-stone-400 hover:text-amber-500 h-8 w-8" data-testid={`button-edit-crafter-template-${t.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => { if (confirm(`Delete template "${t.name}"? Inherited recipes on linked crafters will be removed.`)) deleteMut.mutate(t.id); }}
                      className="text-stone-400 hover:text-red-500 h-8 w-8"
                      data-testid={`button-delete-crafter-template-${t.id}`}
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

      {creating && (
        <CrafterRecipeTemplateCreateDialog
          open={creating}
          onOpenChange={setCreating}
          onCreate={(data) => createMut.mutate(data)}
          isPending={createMut.isPending}
        />
      )}
      {editingId && (
        <CrafterRecipeTemplateEditDialog
          open={!!editingId}
          templateId={editingId}
          onOpenChange={(o) => { if (!o) setEditingId(null); }}
        />
      )}
    </Card>
  );
}

function CrafterRecipeTemplateCreateDialog({ open, onOpenChange, onCreate, isPending }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreate: (data: { name: string; description: string }) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 max-w-md">
        <DialogHeader><DialogTitle className="text-amber-500">New Crafter Recipe Template</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-stone-800 border-stone-700" data-testid="input-new-crafter-template-name" />
          </div>
          <div>
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} className="bg-stone-800 border-stone-700" data-testid="input-new-crafter-template-description" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-stone-600">Cancel</Button>
          <Button
            onClick={() => name.trim() && onCreate({ name: name.trim(), description: description.trim() })}
            disabled={isPending || !name.trim()}
            className="bg-amber-700 hover:bg-amber-600"
            data-testid="button-confirm-create-crafter-template"
          >
            {isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CrafterRecipeTemplateEditDialog({ open, templateId, onOpenChange }: {
  open: boolean;
  templateId: string;
  onOpenChange: (o: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: template, isLoading } = useQuery<any>({
    queryKey: ['crafter-recipe-template', templateId],
    queryFn: () => api.getCrafterRecipeTemplate(templateId),
    enabled: !!templateId,
  });
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  useEffect(() => {
    if (template) {
      setName(template.name || '');
      setDescription(template.description || '');
    }
  }, [template?.id]);

  const saveMut = useMutation({
    mutationFn: () => api.updateCrafterRecipeTemplate(templateId, { name: name.trim(), description: description.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crafter-recipe-templates'] });
      queryClient.invalidateQueries({ queryKey: ['crafter-recipe-template', templateId] });
      toast({ title: 'Template saved' });
    },
    onError: (err: any) => toast({ title: 'Save failed', description: err?.message || String(err), variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-amber-500">Edit Crafter Recipe Template</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pr-2 min-h-0 space-y-4 py-2">
          {isLoading || !template ? (
            <div className="text-center py-8 text-stone-400">Loading…</div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label>Name *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-stone-800 border-stone-700" data-testid="input-edit-crafter-template-name" />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} className="bg-stone-800 border-stone-700" data-testid="input-edit-crafter-template-description" />
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !name.trim()} className="bg-amber-700 hover:bg-amber-600" data-testid="button-save-crafter-template">
                    <Save className="h-4 w-4 mr-1" /> Save details
                  </Button>
                </div>
              </div>
              <div className="pt-4 border-t border-stone-700">
                <CraftRecipesEditor templateId={templateId} systemSlug={systemSlug} />
              </div>
            </>
          )}
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-stone-600">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CrafterTemplateLinksPanel({ itemId, systemSlug, personal }: { itemId: string; systemSlug: string; personal?: boolean }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const { data: templates = [] } = useQuery<any[]>({
    queryKey: ['crafter-recipe-templates', systemSlug, personal],
    queryFn: () => api.listCrafterRecipeTemplates(systemSlug, personal),
    enabled: systemSlug === 'aa-v2' || systemSlug === 'aa-v3',
  });

  const { data: linksData } = useQuery<{ templateIds: string[] }>({
    queryKey: ['crafter-template-links', itemId],
    queryFn: () => api.getCrafterTemplateLinks(itemId),
    enabled: !!itemId,
  });
  const selected: string[] = linksData?.templateIds || [];

  const setLinksMut = useMutation({
    mutationFn: (next: string[]) => api.setCrafterTemplateLinks(itemId, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crafter-template-links', itemId] });
      queryClient.invalidateQueries({ queryKey: ['craft-recipes', itemId] });
      setPendingId(null);
    },
    onError: (err: any) => {
      setPendingId(null);
      toast({ title: 'Failed to update template links', description: err?.message || String(err), variant: 'destructive' });
    },
  });

  const toggle = (id: string) => {
    setPendingId(id);
    const next = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id];
    setLinksMut.mutate(next);
  };

  const summary = selected.length === 0
    ? 'No recipe templates linked'
    : `${selected.length} template${selected.length === 1 ? '' : 's'} linked`;

  return (
    <div data-testid="panel-crafter-template-links">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between p-2 rounded bg-stone-800/60 hover:bg-stone-800 border border-stone-700 text-left"
        data-testid="button-toggle-crafter-template-links"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="h-4 w-4 text-amber-500" /> : <ChevronRight className="h-4 w-4 text-amber-500" />}
          <Hammer className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-medium text-amber-500">Crafter Recipe Templates</span>
          <span className="text-xs text-stone-400">({summary})</span>
        </div>
      </button>
      {expanded && (
        <div className="mt-2 p-3 rounded border border-stone-700 bg-stone-900/40">
          <p className="text-xs text-stone-500 mb-3">
            Tick a template to copy its recipes onto this crafter. Untick to remove the inherited copies. Future edits to template recipes propagate automatically.
          </p>
          {templates.length === 0 ? (
            <p className="text-xs text-stone-500">No crafter recipe templates exist yet. Create one in the Crafter Recipe Templates view.</p>
          ) : (
            <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
              {templates.map((t: any) => {
                const checked = selected.includes(t.id);
                const isPending = setLinksMut.isPending && pendingId === t.id;
                return (
                  <label
                    key={t.id}
                    className={`flex items-center gap-2 p-1.5 rounded hover:bg-stone-800 ${setLinksMut.isPending ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
                    data-testid={`label-crafter-template-link-${t.id}`}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={setLinksMut.isPending}
                      onCheckedChange={() => toggle(t.id)}
                      data-testid={`checkbox-crafter-template-link-${t.id}`}
                    />
                    <span className="text-sm text-stone-200">{t.name}</span>
                    {isPending && <span className="text-xs text-amber-500 ml-auto">Saving…</span>}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


interface ItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<Item>, draftRolls?: any[], templateLinks?: string[]) => void;
  initialData?: Item;
  isLoading?: boolean;
  campaignSystem?: string;
  personal?: boolean;
}

function ItemFormDialog({ open, onOpenChange, onSave, initialData, isLoading, campaignSystem, personal }: ItemFormDialogProps) {
  const [draftRolls, setDraftRolls] = useState<any[]>([]);
  // Multi-template selection (AAv2 only). Always parent-controlled; the parent
  // applies on save for both create and edit flows to avoid race conditions.
  const [selectedTemplateLinks, setSelectedTemplateLinks] = useState<string[]>([]);

  // For existing AAv2 items, fetch the current set of linked template IDs and
  // seed state. Scoped to AA V2 only -- legacy systems use the single-link picker
  // and must not have their (empty) template-link set written back to the server.
  const isAaV2 = campaignSystem === 'aa-v2' || campaignSystem === 'aa-v3';
  const { data: existingLinks } = useQuery({
    queryKey: ['item-template-links', initialData?.id],
    queryFn: () => api.getItemTemplateLinks(initialData!.id),
    enabled: !!initialData?.id && open && isAaV2,
  });

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
    isDetonatable: boolean;
    detonateAoeShape: string;
    detonateAoeRange: number | string;
    canApplyEffects: boolean;
    grantsDcBonus: boolean;
    dcBonusValue: number | string;
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
    price: initialData?.price ?? '',
    currency: initialData?.currency || 'copper',
    durability: initialData?.durability ?? '',
    isContainer: initialData?.isContainer || false,
    carryCapacity: initialData?.carryCapacity ?? '',
    armorSlot: (initialData as any)?.armorSlot || '',
    armorBonus: (initialData as any)?.armorBonus ?? '',
    damageReduction: (initialData as any)?.damageReduction ?? '',
    damageReductionType: (initialData as any)?.damageReductionType || '',
    rationServings: (initialData as any)?.rationServings ?? '',
    isDamaging: (initialData as any)?.isDamaging || false,
    isDetonatable: (initialData as any)?.isDetonatable || false,
    detonateAoeShape: (initialData as any)?.detonateAoeShape || 'circle',
    detonateAoeRange: (initialData as any)?.detonateAoeRange ?? 10,
    canApplyEffects: (initialData as any)?.canApplyEffects || false,
    grantsDcBonus: (initialData as any)?.grantsDcBonus || false,
    dcBonusValue: (initialData as any)?.dcBonusValue ?? 0,
  });

  useEffect(() => {
    if (open) {
      setFormData({
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
        price: initialData?.price ?? '',
        currency: initialData?.currency || 'copper',
        durability: initialData?.durability ?? '',
        isContainer: initialData?.isContainer || false,
        carryCapacity: initialData?.carryCapacity ?? '',
        armorSlot: (initialData as any)?.armorSlot || '',
        armorBonus: (initialData as any)?.armorBonus ?? '',
        damageReduction: (initialData as any)?.damageReduction ?? '',
        damageReductionType: (initialData as any)?.damageReductionType || '',
        rationServings: (initialData as any)?.rationServings ?? '',
        isDamaging: (initialData as any)?.isDamaging || false,
        isDetonatable: (initialData as any)?.isDetonatable || false,
        detonateAoeShape: (initialData as any)?.detonateAoeShape || 'circle',
        detonateAoeRange: (initialData as any)?.detonateAoeRange ?? 10,
        canApplyEffects: (initialData as any)?.canApplyEffects || false,
        grantsDcBonus: (initialData as any)?.grantsDcBonus || false,
        dcBonusValue: (initialData as any)?.dcBonusValue ?? 0,
      });
      setDraftRolls([]);
      setSelectedTemplateLinks([]);
    }
  }, [open, initialData]);

  // When existing-item links load, seed the selection state.
  useEffect(() => {
    if (open && initialData?.id && existingLinks?.templateIds) {
      setSelectedTemplateLinks(existingLinks.templateIds);
    }
  }, [open, initialData?.id, existingLinks]);
  
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
      breakChance: formData.itemType === 'ammunition' ? (formData.breakChance === '' ? 10 : Number(formData.breakChance)) : 10,
      aoe: formData.aoe === 'none' ? undefined : formData.aoe,
      armorBonus: formData.itemType === 'armor' ? optionalNum(formData.armorBonus) : undefined,
      damageReduction: formData.itemType === 'armor' ? optionalNum(formData.damageReduction) : undefined,
      armorSlot: formData.itemType === 'armor' ? formData.armorSlot : undefined,
      damageReductionType: formData.itemType === 'armor' ? formData.damageReductionType : undefined,
      rationServings: formData.itemType === 'consumable' ? optionalNum(formData.rationServings) : undefined,
      isDamaging: formData.itemType === 'consumable' ? formData.isDamaging : false,
      isDetonatable: (formData.itemType === 'weapon' || formData.itemType === 'ammunition') ? formData.isDetonatable : false,
      detonateAoeShape: (formData.itemType === 'weapon' || formData.itemType === 'ammunition') && formData.isDetonatable ? formData.detonateAoeShape : undefined,
      detonateAoeRange: (formData.itemType === 'weapon' || formData.itemType === 'ammunition') && formData.isDetonatable ? optionalNum(formData.detonateAoeRange) : undefined,
      canApplyEffects: formData.itemType === 'weapon' ? formData.canApplyEffects : false,
      grantsDcBonus: formData.grantsDcBonus,
      dcBonusValue: formData.grantsDcBonus ? (Number(formData.dcBonusValue) || 0) : 0,
    };
    // Only sync template-links for AAv2 items. For legacy systems, the panel
    // isn't shown and we must never write back an empty selection.
    //   - In create mode (no id yet), the user's selection IS the desired
    //     state and is sent on Save.
    //   - In edit mode, the ItemTemplateLinksPanel commits every checkbox
    //     toggle to the server live, so we must NOT re-send links here. Doing
    //     so would race with any in-flight live mutation and could silently
    //     overwrite the just-committed state with a stale snapshot.
    const linksToSync = isAaV2 && !initialData?.id
      ? selectedTemplateLinks
      : undefined;
    onSave(
      cleanedData,
      !initialData ? draftRolls : undefined,
      linksToSync,
    );
  };

  return (
    <>
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
                    {isAaV2 && (
                      <SelectItem value="crafter">Crafter</SelectItem>
                    )}
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
                    <Label>Break Chance: {formData.breakChance === '' ? 10 : Number(formData.breakChance)}%</Label>
                    <Slider
                      value={[formData.breakChance === '' ? 10 : Number(formData.breakChance)]}
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

              {(formData.itemType === 'weapon' || formData.itemType === 'ammunition') && (
                <div className="col-span-2 border-t border-stone-700 pt-4 mt-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Checkbox
                      checked={formData.isDetonatable}
                      onCheckedChange={(checked) => setFormData({ ...formData, isDetonatable: !!checked })}
                      data-testid="checkbox-detonatable"
                    />
                    <Label>Is Detonatable?</Label>
                  </div>
                  <p className="text-xs text-stone-500 mb-3">Detonatable items can be placed on the battle map and detonated with an AOE effect</p>
                  {formData.isDetonatable && (
                    <p className="text-xs text-amber-400 pl-6 border-l-2 border-stone-700">Configure detonation settings in the Rolls section below.</p>
                  )}
                </div>
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
                        <SelectItem value="Mind">Mind</SelectItem>
                        <SelectItem value="Poison">Poison</SelectItem>
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

              <div className="col-span-2 border-t border-stone-700 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Checkbox
                    checked={formData.grantsDcBonus}
                    onCheckedChange={(checked) => setFormData({ ...formData, grantsDcBonus: !!checked })}
                    data-testid="checkbox-grants-dc-bonus"
                  />
                  <Label>Grants DC Bonus</Label>
                </div>
                {formData.grantsDcBonus && (
                  <div>
                    <Label>DC Bonus Value</Label>
                    <Input
                      type="number"
                      value={formData.dcBonusValue}
                      onChange={(e) => handleItemNumericChange('dcBonusValue', e.target.value)}
                      className="bg-stone-800 border-stone-700"
                      placeholder="0"
                      data-testid="input-dc-bonus-value"
                    />
                    <p className="text-xs text-stone-500 mt-1">Added to character's DC when this item is equipped</p>
                  </div>
                )}
              </div>

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

            {formData.itemType === 'weapon' && (
              <div className="border-t border-stone-700 pt-4 mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Checkbox
                    checked={formData.canApplyEffects}
                    onCheckedChange={(checked) => setFormData({ ...formData, canApplyEffects: !!checked })}
                    data-testid="checkbox-can-apply-effects"
                  />
                  <Label className="flex items-center gap-2">
                    <Flame className="h-4 w-4 text-violet-400" />
                    Can Apply Effects on Hit
                  </Label>
                </div>
                <p className="text-xs text-stone-500 mb-3">Enable this to apply token effects when the weapon lands an attack</p>
                
                {formData.canApplyEffects && initialData && (
                  <div className="mt-3">
                    <Label className="text-sm text-stone-300 mb-2 block">Manage Item Effects</Label>
                    <ItemEffectsSection itemId={initialData.id} />
                  </div>
                )}
                {formData.canApplyEffects && !initialData && (
                  <p className="text-xs text-amber-500 mt-2">Save the item first to manage effects</p>
                )}
              </div>
            )}

            {!(initialData as any)?.isLiveTemplate && ((campaignSystem || (initialData as any)?.system || 'arcana-adventure') === 'aa-v2' || (campaignSystem || (initialData as any)?.system || 'arcana-adventure') === 'aa-v3') && (
              <div className="pt-4 border-t border-stone-700">
                <ItemTemplateLinksPanel
                  systemSlug={campaignSystem || (initialData as any)?.system || 'aa-v2'}
                  personal={personal}
                  selectedIds={selectedTemplateLinks}
                  onSelectedIdsChange={setSelectedTemplateLinks}
                  ownerType="item"
                  ownerId={initialData?.id}
                />
              </div>
            )}
            {initialData?.id && !(initialData as any)?.isLiveTemplate && (campaignSystem || (initialData as any)?.system || 'arcana-adventure') !== 'aa-v2' && (campaignSystem || (initialData as any)?.system || 'arcana-adventure') !== 'aa-v3' && (
              <div className="pt-4 border-t border-stone-700">
                <ItemTemplateLinkPicker
                  itemId={initialData.id}
                  currentTemplateId={(initialData as any)?.templateItemId || null}
                  systemSlug={campaignSystem || (initialData as any)?.system || 'arcana-adventure'}
                  personal={personal}
                />
              </div>
            )}

            {(campaignSystem || (initialData as any)?.system || 'arcana-adventure') !== 'aa-v3' && (
              <div className="pt-4 border-t border-stone-700">
                <RollEntriesEditor 
                  ownerType="item" 
                  ownerId={initialData?.id}
                  canEdit={true}
                  draftRolls={!initialData?.id ? draftRolls : undefined}
                  onDraftRollsChange={!initialData?.id ? setDraftRolls : undefined}
                  campaignSystem={campaignSystem || 'arcana-adventure'}
                />
              </div>
            )}

            {isAaV2 && formData.itemType === 'crafter' && initialData?.id && (
              <div className="pt-4 border-t border-stone-700">
                <CrafterTemplateLinksPanel itemId={initialData.id} systemSlug={(campaignSystem === 'aa-v3' || (initialData as any)?.system === 'aa-v3') ? 'aa-v3' : 'aa-v2'} personal={personal} />
              </div>
            )}

            {isAaV2 && formData.itemType === 'crafter' && (
              <div className="pt-4 border-t border-stone-700">
                <CraftRecipesEditor itemId={initialData?.id || ''} systemSlug={(campaignSystem === 'aa-v3' || (initialData as any)?.system === 'aa-v3') ? 'aa-v3' : 'aa-v2'} />
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

    <ImageBrowser
      open={showImageBrowser}
      onOpenChange={setShowImageBrowser}
      onSelect={(imageBase64) => {
        setFormData({ ...formData, image: imageBase64 });
        setShowImageBrowser(false);
      }}
      title="Select Item Image"
    />
    </>
  );
}
