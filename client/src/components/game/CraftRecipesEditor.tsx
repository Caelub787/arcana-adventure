import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, ChevronDown, ChevronRight, Hammer, ArrowUp, ArrowDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Props {
  itemId: string;
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
  };
}

export function CraftRecipesEditor({ itemId, systemSlug }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: systemItems = [] } = useQuery<any[]>({
    queryKey: ['system-items-picker', systemSlug],
    queryFn: () => api.getSystemItems(systemSlug),
  });

  const { data: recipes = [], isLoading } = useQuery<any[]>({
    queryKey: ['craft-recipes', itemId],
    queryFn: () => api.getCraftRecipes(itemId),
    enabled: !!itemId,
  });

  const createMut = useMutation({
    mutationFn: (data: DraftRecipe) => api.createCraftRecipe(itemId, data),
    onSuccess: (created: any) => {
      queryClient.invalidateQueries({ queryKey: ['craft-recipes', itemId] });
      setExpandedId(created.id);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: DraftRecipe }) => api.updateCraftRecipe(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['craft-recipes', itemId] });
      toast({ title: 'Recipe saved' });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteCraftRecipe(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['craft-recipes', itemId] }),
  });

  const reorderMut = useMutation({
    mutationFn: ({ id, sortOrder }: { id: string; sortOrder: number }) => api.updateCraftRecipe(id, { sortOrder }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['craft-recipes', itemId] }),
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

  const handleAdd = () => createMut.mutate({ ...newRecipe(), sortOrder: recipes.length });

  if (!itemId) {
    return <p className="text-xs text-stone-500">Save the Crafter item first to add recipes.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-stone-300 flex items-center gap-2">
          <Hammer className="h-4 w-4" /> Crafting Recipes
        </h3>
        <Button type="button" size="sm" onClick={handleAdd} className="bg-amber-700 hover:bg-amber-600" data-testid="button-add-recipe">
          <Plus className="h-3 w-3 mr-1" /> Add Recipe
        </Button>
      </div>

      {isLoading && <p className="text-xs text-stone-500">Loading…</p>}

      {recipes.map((r: any, idx: number) => (
        <RecipeRow
          key={r.id}
          recipe={r}
          systemItems={systemItems}
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

function RecipeRow({
  recipe,
  systemItems,
  expanded,
  onToggle,
  onSave,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  recipe: any;
  systemItems: any[];
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
    noRoll: !!recipe.noRoll,
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
  }));

  const itemPicker = (value: string | null | undefined, onChange: (v: string | null, name: string) => void) => (
    <Select value={value || '__none__'} onValueChange={(v) => {
      if (v === '__none__') return onChange(null, '');
      const found = systemItems.find(s => s.id === v);
      onChange(v, found?.name || '');
    }}>
      <SelectTrigger className="bg-stone-800 border-stone-700 h-8 text-xs">
        <SelectValue placeholder="Select item…" />
      </SelectTrigger>
      <SelectContent className="max-h-60">
        <SelectItem value="__none__">— none —</SelectItem>
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
            {draft.ingredients.length} ingredient{draft.ingredients.length === 1 ? '' : 's'} · {draft.outcomes.length} outcome{draft.outcomes.length === 1 ? '' : 's'}
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
            <div>
              <Label className="text-xs">Output Item</Label>
              {itemPicker(draft.outputItemId, (v) => setDraft({ ...draft, outputItemId: v }))}
            </div>
            <div>
              <Label className="text-xs">Output Quantity</Label>
              <Input type="number" min={1} value={draft.outputQuantity} onChange={(e) => setDraft({ ...draft, outputQuantity: Math.max(1, parseInt(e.target.value) || 1) })} className="bg-stone-800 border-stone-700 h-8" />
            </div>
            <div className="flex items-end gap-2">
              <Switch checked={draft.noRoll} onCheckedChange={(c) => setDraft({ ...draft, noRoll: !!c })} />
              <Label className="text-xs">No roll (auto-success)</Label>
            </div>
          </div>

          {!draft.noRoll && (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Dice</Label>
                <Input value={draft.diceFormula} onChange={(e) => setDraft({ ...draft, diceFormula: e.target.value })} placeholder="1d20" className="bg-stone-800 border-stone-700 h-8" />
              </div>
              <div>
                <Label className="text-xs">Modifier</Label>
                <Input type="number" value={draft.mod} onChange={(e) => setDraft({ ...draft, mod: parseInt(e.target.value) || 0 })} className="bg-stone-800 border-stone-700 h-8" />
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

          {/* Ingredients */}
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
                  <Input type="number" min={1} value={ing.quantity} onChange={(e) => {
                    const next = [...draft.ingredients];
                    next[idx] = { ...next[idx], quantity: Math.max(1, parseInt(e.target.value) || 1) };
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

          {/* Outcomes */}
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
                          <Input type="number" value={o.minTotal ?? ''} onChange={(e) => {
                            const next = [...draft.outcomes];
                            next[idx] = { ...next[idx], minTotal: e.target.value === '' ? null : parseInt(e.target.value) };
                            setDraft({ ...draft, outcomes: next });
                          }} className="bg-stone-800 border-stone-700 h-8" />
                        </div>
                        <div>
                          <Label className="text-xs">Max Total</Label>
                          <Input type="number" value={o.maxTotal ?? ''} onChange={(e) => {
                            const next = [...draft.outcomes];
                            next[idx] = { ...next[idx], maxTotal: e.target.value === '' ? null : parseInt(e.target.value) };
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
                      <Input type="number" value={o.overrideOutputQuantity ?? ''} onChange={(e) => {
                        const next = [...draft.outcomes];
                        next[idx] = { ...next[idx], overrideOutputQuantity: e.target.value === '' ? null : parseInt(e.target.value) };
                        setDraft({ ...draft, outcomes: next });
                      }} className="bg-stone-800 border-stone-700 h-8" />
                    </div>
                    <div>
                      <Label className="text-xs">Override Durability</Label>
                      <Input type="number" value={o.overrideDurability ?? ''} onChange={(e) => {
                        const next = [...draft.outcomes];
                        next[idx] = { ...next[idx], overrideDurability: e.target.value === '' ? null : parseInt(e.target.value) };
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
              {draft.outcomes.length === 0 && <p className="text-xs text-stone-500 italic">No outcomes — default success will be used</p>}
            </div>
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
