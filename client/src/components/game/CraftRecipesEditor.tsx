import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Trash2, ChevronDown, ChevronRight, Hammer, ArrowUp, ArrowDown, Search, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Props {
  itemId?: string;
  templateId?: string;
  systemSlug: string;
}

interface DraftIngredient {
  id?: string;
  itemId?: string | null;
  itemName: string;
  quantity: number;
  sortOrder?: number;
}

interface DraftOutcome {
  id?: string;
  triggerKind: 'range' | 'nat1' | 'nat20';
  minTotal?: number | null;
  maxTotal?: number | null;
  label?: string | null;
  overrideOutputItemId?: string | null;
  overrideOutputQuantity?: number | null;
  overrideDurability?: number | null;
  consumeIngredients: boolean;
  sortOrder?: number;
}

interface DraftRecipe {
  id?: string;
  name: string;
  description?: string;
  diceFormula: string;
  mod: number;
  attribute: string;
  noRoll: boolean;
  outputItemId?: string | null;
  outputQuantity: number;
  sortOrder?: number;
  ingredients: DraftIngredient[];
  outcomes: DraftOutcome[];
  // Optional custom-skill restriction
  requireCustomSkill?: boolean;
  requiredSkillName?: string;
  requiredSkillMinValue?: number;
  // Hide this recipe from players who lack the required knowledge (GMs always see it)
  hideWithoutKnowledge?: boolean;
  // Optional resource costs
  costEnergyEnabled?: boolean;
  costEnergy?: number;
  costManaEnabled?: boolean;
  costMana?: number;
  costHpEnabled?: boolean;
  costHp?: number;
  // AA V3 repair recipe (Task #250)
  isRepairRecipe?: boolean;
  repairTargetTypeId?: string | null;
  repairAmount?: number;
  // AA V3: advanced item types this repair recipe can repair (the cost lives on each item).
  repairTargetTypeIds?: string[];
  // Optional required inventory items: non-consumed "tools" + consumed reagents.
  toolItems?: { itemId: string | null; name: string; consumed: boolean }[];
}

const ATTRIBUTES = ['none', 'might', 'finesse', 'wit', 'presence', 'will', 'craft'];

function newRecipe(): DraftRecipe {
  return {
    name: 'New Recipe',
    description: '',
    diceFormula: '1d20',
    mod: 0,
    attribute: 'craft',
    noRoll: false,
    outputItemId: null,
    outputQuantity: 1,
    ingredients: [],
    outcomes: [
      { triggerKind: 'range', minTotal: 10, maxTotal: null, label: 'Success', consumeIngredients: true },
    ],
    requireCustomSkill: false,
    requiredSkillName: '',
    requiredSkillMinValue: 0,
    hideWithoutKnowledge: false,
    costEnergyEnabled: false,
    costEnergy: 0,
    costManaEnabled: false,
    costMana: 0,
    costHpEnabled: false,
    costHp: 0,
    isRepairRecipe: false,
    repairTargetTypeId: null,
    repairAmount: 1,
    repairTargetTypeIds: [],
    toolItems: [],
  };
}

export function CraftRecipesEditor({ itemId, templateId, systemSlug }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const isTemplateMode = !!templateId;
  const queryKey = isTemplateMode ? ['craft-recipes-template', templateId] : ['craft-recipes', itemId];

  const { data: systemItems = [] } = useQuery<any[]>({
    queryKey: ['system-items-picker', systemSlug],
    queryFn: () => api.getSystemItems(systemSlug),
  });

  // V3 Knowledge picker source = admin-created system skills ("Knowledge").
  const { data: systemSkills = [] } = useQuery<any[]>({
    queryKey: ['system-skills-picker', systemSlug],
    queryFn: () => api.getSystemSkills(systemSlug),
    enabled: systemSlug === 'aa-v3',
  });

  const { data: recipes = [], isLoading } = useQuery<any[]>({
    queryKey,
    queryFn: async () => {
      if (isTemplateMode) {
        const tpl = await api.getCrafterRecipeTemplate(templateId!);
        return tpl?.recipes || [];
      }
      return api.getCraftRecipes(itemId!);
    },
    enabled: isTemplateMode ? !!templateId : !!itemId,
  });

  const createMut = useMutation({
    mutationFn: (data: DraftRecipe) => isTemplateMode
      ? api.createCrafterTemplateRecipe(templateId!, data)
      : api.createCraftRecipe(itemId!, data),
    onSuccess: (created: any) => {
      queryClient.invalidateQueries({ queryKey });
      setExpandedId(created.id);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: DraftRecipe }) => api.updateCraftRecipe(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: 'Recipe saved' });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteCraftRecipe(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const reorderMut = useMutation({
    mutationFn: ({ id, sortOrder }: { id: string; sortOrder: number }) => api.updateCraftRecipe(id, { sortOrder }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const moveRecipe = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= recipes.length) return;
    const a = recipes[idx];
    const b = recipes[next];
    const aOrder = a.sortOrder ?? idx;
    const bOrder = b.sortOrder ?? next;
    reorderMut.mutate({ id: a.id, sortOrder: bOrder });
    reorderMut.mutate({ id: b.id, sortOrder: aOrder });
  };

  const handleAdd = () => createMut.mutate({ ...newRecipe(), noRoll: systemSlug === 'aa-v3' ? true : false, sortOrder: recipes.length });

  if (!isTemplateMode && !itemId) {
    return <p className="text-xs text-stone-500">Save the Crafter item first to add recipes.</p>;
  }
  if (isTemplateMode && !templateId) {
    return <p className="text-xs text-stone-500">Save the template first to add recipes.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-stone-300 flex items-center gap-2">
          <Hammer className="h-4 w-4" /> Crafting Recipes
        </h3>
        <div className="flex items-center gap-2">
          {!isTemplateMode && itemId && (
            <AddRecipeFromItem
              crafterItemId={itemId}
              systemSlug={systemSlug}
              onAdded={() => queryClient.invalidateQueries({ queryKey })}
            />
          )}
          <Button type="button" size="sm" onClick={handleAdd} className="bg-amber-700 hover:bg-amber-600" data-testid="button-add-recipe">
            <Plus className="h-3 w-3 mr-1" /> Add Recipe
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-xs text-stone-500">Loading…</p>}

      {recipes.map((r: any, idx: number) => (
        <RecipeRow
          key={r.id}
          recipe={r}
          systemSlug={systemSlug}
          systemItems={systemItems}
          systemSkills={systemSkills}
          expanded={expandedId === r.id}
          onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
          onSave={(data) => updateMut.mutate({ id: r.id, data })}
          onDelete={() => {
            if (confirm(`Delete recipe "${r.name}"?`)) deleteMut.mutate(r.id);
          }}
          onMoveUp={idx > 0 ? () => moveRecipe(idx, -1) : undefined}
          onMoveDown={idx < recipes.length - 1 ? () => moveRecipe(idx, 1) : undefined}
        />
      ))}

      {recipes.length === 0 && !isLoading && (
        <p className="text-xs text-stone-500 italic">No recipes yet. Add one above.</p>
      )}
    </div>
  );
}

// Searchable item picker (V3) — mirrors the "add item to inventory" library
// browser style (search box + scrollable card list) instead of a dropdown.
function ItemSearchPicker({ value, systemItems, onChange, placeholder = 'Select item…', searchPlaceholder = 'Search items...' }: {
  value: string | null | undefined;
  systemItems: any[];
  onChange: (v: string | null, name: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = value ? systemItems.find(s => s.id === value) : null;
  const q = search.trim().toLowerCase();
  const filtered = q ? systemItems.filter(s => (s.name || '').toLowerCase().includes(q)) : systemItems;
  const pick = (id: string | null, name: string) => {
    onChange(id, name);
    setOpen(false);
    setSearch('');
  };
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(''); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between bg-stone-800 border-stone-700 h-8 text-xs font-normal"
          data-testid="button-item-picker"
        >
          <span className={selected ? 'text-stone-200 truncate' : 'text-stone-500'}>
            {selected ? selected.name : placeholder}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0 bg-stone-900 border-stone-700" align="start">
        <div className="p-2 border-b border-stone-700">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-500" />
            <Input
              autoFocus
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 bg-stone-800 border-stone-700 h-8 text-xs"
              data-testid="input-item-picker-search"
            />
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto py-1">
          <button
            type="button"
            onClick={() => pick(null, '')}
            className="w-full text-left px-3 py-1.5 text-xs text-stone-400 hover:bg-stone-800"
            data-testid="button-item-picker-none"
          >
            None
          </button>
          {filtered.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => pick(s.id, s.name || '')}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-stone-800"
              data-testid={`button-item-picker-option-${s.id}`}
            >
              {s.image ? (
                <img src={s.image} alt="" className="h-6 w-6 rounded object-cover border border-stone-700 shrink-0" />
              ) : (
                <div className="h-6 w-6 rounded bg-stone-800 border border-stone-700 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-xs text-stone-200 truncate">{s.name}</div>
                {s.itemType && <div className="text-[10px] text-stone-500 capitalize">{s.itemType}</div>}
              </div>
            </button>
          ))}
          {filtered.length === 0 && <p className="px-3 py-2 text-xs text-stone-500 italic">No items found</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Name-based searchable picker for V3 Knowledge (admin-created system skills).
function KnowledgeSearchPicker({ value, systemSkills, onChange }: {
  value: string | null | undefined;
  systemSkills: any[];
  onChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const filtered = q ? systemSkills.filter(s => (s.name || '').toLowerCase().includes(q)) : systemSkills;
  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
    setSearch('');
  };
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(''); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between bg-stone-800 border-stone-700 h-8 text-xs font-normal"
          data-testid="button-knowledge-picker"
        >
          <span className={value ? 'text-stone-200 truncate' : 'text-stone-500'}>
            {value || 'Select Knowledge…'}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0 bg-stone-900 border-stone-700" align="start">
        <div className="p-2 border-b border-stone-700">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-500" />
            <Input
              autoFocus
              placeholder="Search Knowledge..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 bg-stone-800 border-stone-700 h-8 text-xs"
              data-testid="input-knowledge-picker-search"
            />
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto py-1">
          <button
            type="button"
            onClick={() => pick('')}
            className="w-full text-left px-3 py-1.5 text-xs text-stone-400 hover:bg-stone-800"
            data-testid="button-knowledge-picker-none"
          >
            None
          </button>
          {/* Allow free-typed Knowledge names — V3 may have no predefined Knowledge list yet. */}
          {search.trim() && !filtered.some(s => (s.name || '').toLowerCase() === search.trim().toLowerCase()) && (
            <button
              type="button"
              onClick={() => pick(search.trim())}
              className="w-full text-left px-3 py-1.5 text-xs text-amber-400 hover:bg-stone-800 truncate"
              data-testid="button-knowledge-picker-custom"
            >
              Use "{search.trim()}"
            </button>
          )}
          {filtered.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => pick(s.name || '')}
              className="w-full text-left px-3 py-1.5 text-xs text-stone-200 hover:bg-stone-800 truncate"
              data-testid={`button-knowledge-picker-option-${s.id}`}
            >
              {s.name}
            </button>
          ))}
          {filtered.length === 0 && !search.trim() && <p className="px-3 py-2 text-xs text-stone-500 italic">{systemSkills.length === 0 ? 'Type a Knowledge name above to set one.' : 'No matches'}</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Searchable "Add recipe from item" control. Lets the GM pick any item that
// already has a build recipe and copy that recipe directly onto this crafter.
function AddRecipeFromItem({ crafterItemId, systemSlug, onAdded }: {
  crafterItemId: string;
  systemSlug: string;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data: items = [] } = useQuery<any[]>({
    queryKey: ['items-with-build-recipes', systemSlug],
    queryFn: () => api.getItemsWithBuildRecipes(systemSlug),
    enabled: (systemSlug === 'aa-v2' || systemSlug === 'aa-v3') && open,
  });
  const reset = () => { setSearch(''); setTypeFilter(null); setSelected(new Set()); };
  const addMut = useMutation({
    mutationFn: async (ids: string[]) => {
      let succeeded = 0;
      const failed: string[] = [];
      for (const id of ids) {
        try {
          await api.addItemRecipeToCrafter(crafterItemId, id);
          succeeded++;
        } catch {
          failed.push(id);
        }
      }
      return { succeeded, failed };
    },
    onSuccess: ({ succeeded, failed }) => {
      if (failed.length === 0) {
        toast({ title: `Added ${succeeded} recipe${succeeded === 1 ? '' : 's'} from items` });
        setOpen(false);
        reset();
      } else {
        toast({ title: `Added ${succeeded}, ${failed.length} failed`, description: 'Failed items stay selected. Try again.', variant: 'destructive' });
        setSelected(new Set(failed));
      }
    },
    onSettled: () => onAdded(),
  });
  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const q = search.trim().toLowerCase();
  const types = Array.from(new Set(items.map(s => s.itemType).filter(Boolean) as string[])).sort();
  const filtered = items.filter(s =>
    (!typeFilter || s.itemType === typeFilter) &&
    (!q || (s.name || '').toLowerCase().includes(q))
  );
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="border-stone-600" data-testid="button-add-recipe-from-item">
          <Plus className="h-3 w-3 mr-1" /> Add from items
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0 bg-stone-900 border-stone-700" align="end">
        <div className="p-2 border-b border-stone-700">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-500" />
            <Input
              autoFocus
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 bg-stone-800 border-stone-700 h-8 text-xs"
              data-testid="input-add-recipe-from-item-search"
            />
          </div>
          {types.length > 1 && (
            <div className="flex flex-wrap gap-1 mt-2">
              <button
                type="button"
                onClick={() => setTypeFilter(null)}
                className={`px-2 py-0.5 rounded-full text-[10px] capitalize border ${typeFilter === null ? 'bg-amber-700 border-amber-600 text-white' : 'bg-stone-800 border-stone-600 text-stone-300 hover:bg-stone-700'}`}
                data-testid="button-add-recipe-from-item-type-all"
              >
                All
              </button>
              {types.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter((cur) => (cur === t ? null : t))}
                  className={`px-2 py-0.5 rounded-full text-[10px] capitalize border ${typeFilter === t ? 'bg-amber-700 border-amber-600 text-white' : 'bg-stone-800 border-stone-600 text-stone-300 hover:bg-stone-700'}`}
                  data-testid={`button-add-recipe-from-item-type-${t}`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="max-h-60 overflow-y-auto py-1">
          {filtered.map(s => {
            const isSel = selected.has(s.id);
            return (
              <button
                key={s.id}
                type="button"
                disabled={addMut.isPending}
                onClick={() => toggle(s.id)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-stone-800 disabled:opacity-50 ${isSel ? 'bg-amber-900/40' : ''}`}
                data-testid={`button-add-recipe-from-item-option-${s.id}`}
              >
                <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${isSel ? 'bg-amber-600 border-amber-500' : 'border-stone-600'}`}>
                  {isSel && <Check className="h-3 w-3 text-white" />}
                </div>
                {s.image ? (
                  <img src={s.image} alt="" className="h-6 w-6 rounded object-cover border border-stone-700 shrink-0" />
                ) : (
                  <div className="h-6 w-6 rounded bg-stone-800 border border-stone-700 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-stone-200 truncate">{s.name}</div>
                  {s.itemType && <div className="text-[10px] text-stone-500 capitalize">{s.itemType}</div>}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-3 py-2 text-xs text-stone-500 italic">
              {items.length === 0 ? 'No items with build recipes yet.' : 'No items found'}
            </p>
          )}
        </div>
        <div className="p-2 border-t border-stone-700 flex items-center justify-between gap-2">
          <span className="text-[11px] text-stone-400">{selected.size} selected</span>
          <Button
            type="button"
            size="sm"
            disabled={selected.size === 0 || addMut.isPending}
            onClick={() => addMut.mutate(Array.from(selected))}
            className="bg-amber-700 hover:bg-amber-600 h-7"
            data-testid="button-add-recipe-from-item-confirm"
          >
            <Plus className="h-3 w-3 mr-1" /> {addMut.isPending ? 'Adding…' : `Add ${selected.size || ''} item${selected.size === 1 ? '' : 's'}`.trim()}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RecipeRow({
  recipe,
  systemSlug,
  systemItems,
  systemSkills,
  expanded,
  onToggle,
  onSave,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  recipe: any;
  systemSlug: string;
  systemItems: any[];
  systemSkills: any[];
  expanded: boolean;
  onToggle: () => void;
  onSave: (data: DraftRecipe) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const [draft, setDraft] = useState<DraftRecipe>(() => ({
    name: recipe.name,
    description: recipe.description || '',
    diceFormula: recipe.diceFormula || '1d20',
    mod: recipe.mod ?? 0,
    attribute: recipe.attribute || 'craft',
    noRoll: systemSlug === 'aa-v3' ? true : !!recipe.noRoll,
    outputItemId: recipe.outputItemId || null,
    outputQuantity: recipe.outputQuantity ?? 1,
    ingredients: (recipe.ingredients || []).map((i: any) => ({
      itemId: i.itemId, itemName: i.itemName, quantity: i.quantity, sortOrder: i.sortOrder,
    })),
    outcomes: (recipe.outcomes || []).map((o: any) => ({
      triggerKind: o.triggerKind, minTotal: o.minTotal, maxTotal: o.maxTotal, label: o.label,
      overrideOutputItemId: o.overrideOutputItemId, overrideOutputQuantity: o.overrideOutputQuantity,
      overrideDurability: o.overrideDurability, consumeIngredients: !!o.consumeIngredients, sortOrder: o.sortOrder,
    })),
    requireCustomSkill: !!recipe.requireCustomSkill,
    requiredSkillName: recipe.requiredSkillName || '',
    requiredSkillMinValue: recipe.requiredSkillMinValue ?? 0,
    hideWithoutKnowledge: !!recipe.hideWithoutKnowledge,
    costEnergyEnabled: !!recipe.costEnergyEnabled,
    costEnergy: recipe.costEnergy ?? 0,
    costManaEnabled: !!recipe.costManaEnabled,
    costMana: recipe.costMana ?? 0,
    costHpEnabled: !!recipe.costHpEnabled,
    costHp: recipe.costHp ?? 0,
    isRepairRecipe: !!recipe.isRepairRecipe,
    repairTargetTypeId: recipe.repairTargetTypeId || null,
    repairAmount: recipe.repairAmount ?? 1,
    repairTargetTypeIds: Array.isArray(recipe.repairTargetTypeIds) && recipe.repairTargetTypeIds.length > 0
      ? recipe.repairTargetTypeIds
      : (recipe.repairTargetTypeId ? [recipe.repairTargetTypeId] : []),
    toolItems: Array.isArray(recipe.toolItems)
      ? recipe.toolItems.map((t: any) => ({ itemId: t.itemId ?? null, name: t.name || '', consumed: !!t.consumed }))
      : [],
  }));

  const isV3 = systemSlug === 'aa-v3';

  const { data: advancedItemTypes = [] } = useQuery<any[]>({
    queryKey: ['advanced-item-types'],
    queryFn: () => api.getAdvancedItemTypes(),
    enabled: isV3,
  });

  const itemPicker = (value: string | null | undefined, onChange: (v: string | null, name: string) => void) => isV3 ? (
    <ItemSearchPicker value={value} systemItems={systemItems} onChange={onChange} />
  ) : (
    <Select value={value || '__none__'} onValueChange={(v) => {
      if (v === '__none__') return onChange(null, '');
      const found = systemItems.find(s => s.id === v);
      onChange(v, found?.name || '');
    }}>
      <SelectTrigger className="bg-stone-800 border-stone-700 h-8 text-xs">
        <SelectValue placeholder="Select item…" />
      </SelectTrigger>
      <SelectContent className="max-h-60">
        <SelectItem value="__none__">None</SelectItem>
        {systemItems.map(s => (
          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="border border-stone-700 rounded bg-stone-900/40">
      <div className="flex items-center justify-between px-2 py-1.5">
        <button type="button" onClick={onToggle} className="flex items-center gap-2 text-left flex-1 text-stone-200 text-sm" data-testid={`button-toggle-recipe-${recipe.id}`}>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="font-semibold">{draft.name || '(unnamed)'}</span>
          <span className="text-xs text-stone-500">
            {draft.ingredients.length} ingredient{draft.ingredients.length === 1 ? '' : 's'}
            {systemSlug !== 'aa-v3' && ` · ${draft.outcomes.length} outcome${draft.outcomes.length === 1 ? '' : 's'}`}
          </span>
        </button>
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={onMoveUp} disabled={!onMoveUp} className="h-7 w-7 p-0 text-stone-400 disabled:opacity-30" data-testid={`button-move-up-recipe-${recipe.id}`}>
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onMoveDown} disabled={!onMoveDown} className="h-7 w-7 p-0 text-stone-400 disabled:opacity-30" data-testid={`button-move-down-recipe-${recipe.id}`}>
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onDelete} className="h-7 w-7 p-0 text-red-400 hover:text-red-300" data-testid={`button-delete-recipe-${recipe.id}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-stone-700 p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="bg-stone-800 border-stone-700 h-8" />
            </div>
            {!draft.isRepairRecipe && (<>
            <div>
              <Label className="text-xs">Output Item</Label>
              {itemPicker(draft.outputItemId, (v) => setDraft({ ...draft, outputItemId: v }))}
            </div>
            <div>
              <Label className="text-xs">Output Quantity</Label>
              <NumberInput min={1} fallback={1} value={draft.outputQuantity} onChange={(v) => setDraft({ ...draft, outputQuantity: v ?? 1 })} className="bg-stone-800 border-stone-700 h-8" />
            </div>
            </>)}
            {!isV3 && (
              <div className="flex items-end gap-2">
                <Switch checked={draft.noRoll} onCheckedChange={(c) => setDraft({ ...draft, noRoll: !!c })} />
                <Label className="text-xs">No roll (auto-success)</Label>
              </div>
            )}
          </div>

          {isV3 && (
            <div className="border border-amber-800/50 rounded p-2 space-y-2">
              <div className="flex items-center gap-2">
                <Switch
                  checked={!!draft.isRepairRecipe}
                  onCheckedChange={(c) => setDraft({ ...draft, isRepairRecipe: !!c })}
                  data-testid={`switch-repair-recipe-${recipe.id}`}
                />
                <Label className="text-xs font-bold text-amber-500">Repair recipe</Label>
              </div>
              {draft.isRepairRecipe && (
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">Repairs Item Types</Label>
                    {(draft.repairTargetTypeIds && draft.repairTargetTypeIds.length > 0) ? (
                      <div className="flex flex-wrap gap-1 mb-1" data-testid={`repair-types-${recipe.id}`}>
                        {draft.repairTargetTypeIds.map((tid) => {
                          const name = advancedItemTypes.find((t: any) => t.id === tid)?.name || 'Unknown type';
                          return (
                            <span key={tid} className="inline-flex items-center gap-1 bg-stone-800 border border-stone-600 rounded px-1.5 py-0.5 text-[11px] text-stone-200">
                              {name}
                              <button
                                type="button"
                                onClick={() => setDraft({ ...draft, repairTargetTypeIds: (draft.repairTargetTypeIds || []).filter((x) => x !== tid) })}
                                className="text-stone-400 hover:text-red-400"
                                data-testid={`remove-repair-type-${recipe.id}-${tid}`}
                              >×</button>
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] text-amber-400/80 mb-1">No item types yet. Add at least one.</p>
                    )}
                    <ItemSearchPicker
                      value={null}
                      systemItems={advancedItemTypes.filter((t: any) => !(draft.repairTargetTypeIds || []).includes(t.id))}
                      onChange={(v) => { if (v) setDraft({ ...draft, repairTargetTypeIds: [...(draft.repairTargetTypeIds || []), v] }); }}
                      placeholder="Add item type…"
                      searchPlaceholder="Search item types..."
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Durability restored (default)</Label>
                    <NumberInput
                      min={0}
                      className="bg-stone-800 border-stone-700 h-8 text-xs w-28"
                      value={draft.repairAmount ?? 1}
                      onChange={(v) => setDraft({ ...draft, repairAmount: v ?? 0 })}
                      data-testid={`input-repair-amount-${recipe.id}`}
                    />
                  </div>
                  <p className="text-[11px] text-stone-500">
                    Players use this recipe at a crafter they own to repair any item tagged with one of these types. Repair ingredients are configured on each item. Durability restored uses the item's own "repair amount" if set; otherwise this recipe's default applies.
                  </p>
                </div>
              )}
            </div>
          )}

          {!isV3 && !draft.noRoll && (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Dice</Label>
                <Input value={draft.diceFormula} onChange={(e) => setDraft({ ...draft, diceFormula: e.target.value })} placeholder="1d20" className="bg-stone-800 border-stone-700 h-8" />
              </div>
              <div>
                <Label className="text-xs">Modifier</Label>
                <NumberInput value={draft.mod} onChange={(v) => setDraft({ ...draft, mod: v ?? 0 })} className="bg-stone-800 border-stone-700 h-8" />
              </div>
              <div>
                <Label className="text-xs">Attribute</Label>
                <Select value={draft.attribute} onValueChange={(v) => setDraft({ ...draft, attribute: v })}>
                  <SelectTrigger className="bg-stone-800 border-stone-700 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ATTRIBUTES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">Description</Label>
            <Input value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="bg-stone-800 border-stone-700 h-8" />
          </div>

          {/* Ingredients — hidden for repair recipes (cost lives on each item). */}
          {!draft.isRepairRecipe && (
          <div className="border border-stone-700 rounded p-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-amber-500">Ingredients</span>
              <Button type="button" size="sm" variant="outline" onClick={() => setDraft({ ...draft, ingredients: [...draft.ingredients, { itemId: null, itemName: '', quantity: 1 }] })} className="h-7" data-testid="button-add-ingredient">
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            <div className="space-y-1.5">
              {draft.ingredients.map((ing, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_70px_30px] gap-1 items-center">
                  {itemPicker(ing.itemId, (id, name) => {
                    const next = [...draft.ingredients];
                    next[idx] = { ...next[idx], itemId: id, itemName: name || next[idx].itemName };
                    setDraft({ ...draft, ingredients: next });
                  })}
                  <NumberInput min={1} fallback={1} value={ing.quantity} onChange={(v) => {
                    const next = [...draft.ingredients];
                    next[idx] = { ...next[idx], quantity: v ?? 1 };
                    setDraft({ ...draft, ingredients: next });
                  }} className="bg-stone-800 border-stone-700 h-8" />
                  <Button type="button" size="sm" variant="ghost" onClick={() => setDraft({ ...draft, ingredients: draft.ingredients.filter((_, i) => i !== idx) })} className="h-7 w-7 p-0 text-red-400">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              {draft.ingredients.length === 0 && <p className="text-xs text-stone-500 italic">No ingredients required</p>}
            </div>
          </div>
          )}

          {/* Outcomes — roll-driven, hidden for V3 (auto-success, no roll) */}
          {!isV3 && (
          <div className="border border-stone-700 rounded p-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-amber-500">Outcomes</span>
              <Button type="button" size="sm" variant="outline" onClick={() => setDraft({ ...draft, outcomes: [...draft.outcomes, { triggerKind: 'range', minTotal: null, maxTotal: null, label: '', consumeIngredients: true }] })} className="h-7" data-testid="button-add-outcome">
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            <div className="space-y-2">
              {draft.outcomes.map((o, idx) => (
                <div key={idx} className="border border-stone-800 rounded p-2 space-y-2 bg-stone-950/30">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Trigger</Label>
                      <Select value={o.triggerKind} onValueChange={(v) => {
                        const next = [...draft.outcomes];
                        const kind = (v === 'nat1' || v === 'nat20' || v === 'range') ? v : 'range';
                        next[idx] = { ...next[idx], triggerKind: kind };
                        setDraft({ ...draft, outcomes: next });
                      }}>
                        <SelectTrigger className="bg-stone-800 border-stone-700 h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="range">Range</SelectItem>
                          <SelectItem value="nat1">Nat 1 (d20)</SelectItem>
                          <SelectItem value="nat20">Nat 20 (d20)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {o.triggerKind === 'range' && (
                      <>
                        <div>
                          <Label className="text-xs">Min Total</Label>
                          <NumberInput optional value={o.minTotal ?? undefined} onChange={(v) => {
                            const next = [...draft.outcomes];
                            next[idx] = { ...next[idx], minTotal: v ?? null };
                            setDraft({ ...draft, outcomes: next });
                          }} className="bg-stone-800 border-stone-700 h-8" />
                        </div>
                        <div>
                          <Label className="text-xs">Max Total</Label>
                          <NumberInput optional value={o.maxTotal ?? undefined} onChange={(v) => {
                            const next = [...draft.outcomes];
                            next[idx] = { ...next[idx], maxTotal: v ?? null };
                            setDraft({ ...draft, outcomes: next });
                          }} className="bg-stone-800 border-stone-700 h-8" />
                        </div>
                      </>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Label</Label>
                      <Input value={o.label || ''} onChange={(e) => {
                        const next = [...draft.outcomes];
                        next[idx] = { ...next[idx], label: e.target.value };
                        setDraft({ ...draft, outcomes: next });
                      }} className="bg-stone-800 border-stone-700 h-8" />
                    </div>
                    <div className="flex items-end gap-2">
                      <Switch checked={o.consumeIngredients} onCheckedChange={(c) => {
                        const next = [...draft.outcomes];
                        next[idx] = { ...next[idx], consumeIngredients: !!c };
                        setDraft({ ...draft, outcomes: next });
                      }} />
                      <Label className="text-xs">Consume ingredients</Label>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Override Output</Label>
                      {itemPicker(o.overrideOutputItemId, (id) => {
                        const next = [...draft.outcomes];
                        next[idx] = { ...next[idx], overrideOutputItemId: id };
                        setDraft({ ...draft, outcomes: next });
                      })}
                    </div>
                    <div>
                      <Label className="text-xs">Override Qty</Label>
                      <NumberInput optional value={o.overrideOutputQuantity ?? undefined} onChange={(v) => {
                        const next = [...draft.outcomes];
                        next[idx] = { ...next[idx], overrideOutputQuantity: v ?? null };
                        setDraft({ ...draft, outcomes: next });
                      }} className="bg-stone-800 border-stone-700 h-8" />
                    </div>
                    <div>
                      <Label className="text-xs">Override Durability</Label>
                      <NumberInput optional value={o.overrideDurability ?? undefined} onChange={(v) => {
                        const next = [...draft.outcomes];
                        next[idx] = { ...next[idx], overrideDurability: v ?? null };
                        setDraft({ ...draft, outcomes: next });
                      }} className="bg-stone-800 border-stone-700 h-8" />
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1">
                      <Button type="button" size="sm" variant="ghost" disabled={idx === 0} onClick={() => {
                        const next = [...draft.outcomes];
                        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                        setDraft({ ...draft, outcomes: next.map((o, i) => ({ ...o, sortOrder: i })) });
                      }} className="h-7 w-7 p-0 text-stone-400 disabled:opacity-30" data-testid={`button-move-up-outcome-${idx}`}>
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button type="button" size="sm" variant="ghost" disabled={idx === draft.outcomes.length - 1} onClick={() => {
                        const next = [...draft.outcomes];
                        [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                        setDraft({ ...draft, outcomes: next.map((o, i) => ({ ...o, sortOrder: i })) });
                      }} className="h-7 w-7 p-0 text-stone-400 disabled:opacity-30" data-testid={`button-move-down-outcome-${idx}`}>
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setDraft({ ...draft, outcomes: draft.outcomes.filter((_, i) => i !== idx) })} className="h-7 text-red-400">
                      <Trash2 className="h-3 w-3 mr-1" /> Remove outcome
                    </Button>
                  </div>
                </div>
              ))}
              {draft.outcomes.length === 0 && <p className="text-xs text-stone-500 italic">No outcomes, default success will be used</p>}
            </div>
          </div>
          )}

          {/* Custom Skill Restriction */}
          <div className="border border-stone-700 rounded p-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-amber-500">{systemSlug === 'aa-v3' ? 'Knowledge Restriction' : 'Skill Restriction'}</span>
              <div className="flex items-center gap-2">
                <Switch checked={!!draft.requireCustomSkill} onCheckedChange={(c) => setDraft({ ...draft, requireCustomSkill: !!c })} data-testid="switch-require-skill" />
                <Label className="text-xs">Required</Label>
              </div>
            </div>
            {draft.requireCustomSkill && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">{systemSlug === 'aa-v3' ? 'Knowledge Name' : 'Custom Skill Name'}</Label>
                  {systemSlug === 'aa-v3' ? (
                    <KnowledgeSearchPicker
                      value={draft.requiredSkillName}
                      systemSkills={systemSkills}
                      onChange={(name) => setDraft({ ...draft, requiredSkillName: name })}
                    />
                  ) : (
                    <Input
                      value={draft.requiredSkillName || ''}
                      onChange={(e) => setDraft({ ...draft, requiredSkillName: e.target.value })}
                      placeholder="e.g. Smithing"
                      className="bg-stone-800 border-stone-700 h-8"
                      data-testid="input-required-skill-name"
                    />
                  )}
                </div>
                <div>
                  <Label className="text-xs">Min Value</Label>
                  <NumberInput
                    value={draft.requiredSkillMinValue ?? 0}
                    onChange={(v) => setDraft({ ...draft, requiredSkillMinValue: v ?? 0 })}
                    className="bg-stone-800 border-stone-700 h-8"
                    data-testid="input-required-skill-min"
                  />
                </div>
                <div className="col-span-2 flex items-center justify-between rounded border border-stone-700 px-2 py-1.5">
                  <div className="min-w-0 pr-2">
                    <Label className="text-xs">Hide from players without this {systemSlug === 'aa-v3' ? 'Knowledge' : 'skill'}</Label>
                    <p className="text-[10px] text-stone-500">Off (default): everyone sees this recipe. On: only players who meet the requirement (and GMs) see it.</p>
                  </div>
                  <Switch
                    checked={!!draft.hideWithoutKnowledge}
                    onCheckedChange={(c) => setDraft({ ...draft, hideWithoutKnowledge: !!c })}
                    data-testid="switch-hide-without-knowledge"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Resource Costs */}
          <div className="border border-stone-700 rounded p-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-amber-500">Resource Costs</span>
            </div>
            <div className="space-y-2">
              {([
                ['costEnergyEnabled', 'costEnergy', 'Energy', 'energy'],
                ['costManaEnabled', 'costMana', 'Mana', 'mana'],
                ['costHpEnabled', 'costHp', 'Health (HP)', 'hp'],
              ] as const).map(([enabledKey, valueKey, label, slug]) => (
                <div key={slug} className="grid grid-cols-[110px_1fr_90px] gap-2 items-center">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={!!(draft as any)[enabledKey]}
                      onCheckedChange={(c) => setDraft({ ...draft, [enabledKey]: !!c } as any)}
                      data-testid={`switch-cost-${slug}`}
                    />
                    <Label className="text-xs">{label}</Label>
                  </div>
                  <div />
                  <NumberInput
                    min={0}
                    disabled={!(draft as any)[enabledKey]}
                    value={(draft as any)[valueKey] ?? 0}
                    onChange={(v) => setDraft({ ...draft, [valueKey]: v ?? 0 } as any)}
                    className="bg-stone-800 border-stone-700 h-8 disabled:opacity-50"
                    data-testid={`input-cost-${slug}`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Required tools / consumed reagents */}
          <div className="border border-stone-700 rounded p-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-amber-500">Required Tools / Items</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-amber-400 hover:text-amber-300"
                onClick={() => setDraft({ ...draft, toolItems: [...(draft.toolItems || []), { itemId: null, name: '', consumed: false }] })}
                data-testid={`button-add-tool-${recipe.id}`}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            </div>
            <p className="text-[11px] text-stone-500 mb-2">
              Items the character must have to craft. Leave "consumed" off for a tool that stays in the inventory; turn it on for an item that is used up.
            </p>
            {(draft.toolItems || []).length === 0 ? (
              <p className="text-xs text-stone-500 italic">No required tools.</p>
            ) : (
              <div className="space-y-2">
                {(draft.toolItems || []).map((tool, ti) => (
                  <div key={ti} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center" data-testid={`tool-row-${recipe.id}-${ti}`}>
                    <div>
                      {itemPicker(tool.itemId, (id, name) => {
                        const next = [...(draft.toolItems || [])];
                        next[ti] = { ...next[ti], itemId: id, name: name || next[ti].name };
                        setDraft({ ...draft, toolItems: next });
                      })}
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-stone-300 whitespace-nowrap">
                      <Switch
                        checked={!!tool.consumed}
                        onCheckedChange={(c) => {
                          const next = [...(draft.toolItems || [])];
                          next[ti] = { ...next[ti], consumed: !!c };
                          setDraft({ ...draft, toolItems: next });
                        }}
                        data-testid={`switch-tool-consumed-${recipe.id}-${ti}`}
                      />
                      Consumed
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-red-400 hover:text-red-300"
                      onClick={() => setDraft({ ...draft, toolItems: (draft.toolItems || []).filter((_, i) => i !== ti) })}
                      data-testid={`button-remove-tool-${recipe.id}-${ti}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={() => onSave(draft)} className="bg-amber-700 hover:bg-amber-600" data-testid={`button-save-recipe-${recipe.id}`}>
              Save Recipe
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
