import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  v3ManaCost,
  v3CraftDc,
  isValidV3Composition,
  type V3SpellComposition,
} from "@shared/v3spells";
import { api, type V3Spell } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ImageBrowser } from "@/components/ImageBrowser";
import { V3CompositionEditor } from "@/components/game/V3SpellCrafter";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Loader2, Image as ImageIcon, BookOpen } from "lucide-react";

const DEFAULT_COMP: V3SpellComposition = {
  core: "",
  secondaries: [],
  intent: "",
  delivery: "",
  reach: "self",
  duration: "instant",
};

/**
 * Library-side manager for pre-loading spells into a spellbook item so it
 * arrives populated when granted to a character. Rendered inside the package
 * ItemDialog's "Spellbook" section via the host's `spellbookManager` slot.
 */
export function SpellbookLibraryManager({
  itemId,
  maxSpells,
}: {
  itemId?: string;
  maxSpells: number;
  campaignSystem?: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [comp, setComp] = useState<V3SpellComposition>(DEFAULT_COMP);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [showImageBrowser, setShowImageBrowser] = useState(false);

  const spellsKey = ["spellbook-spells", itemId];

  const { data: spells = [], isLoading } = useQuery<V3Spell[]>({
    queryKey: spellsKey,
    queryFn: () => api.getSpellbookSpells(itemId!),
    enabled: !!itemId,
  });

  const count = spells.length;
  const atCapacity = maxSpells > 0 && count >= maxSpells;
  const manaCost = useMemo(() => v3ManaCost(comp), [comp]);
  const craftDc = useMemo(() => v3CraftDc(comp), [comp]);
  const valid = useMemo(
    () => isValidV3Composition(comp) && !!comp.core && !!comp.intent && !!comp.delivery && !!name.trim(),
    [comp, name],
  );

  const resetForm = () => {
    setComp(DEFAULT_COMP);
    setName("");
    setDescription("");
    setImage(null);
    setAdding(false);
  };

  const addMutation = useMutation({
    mutationFn: () =>
      api.addSpellToSpellbook(itemId!, {
        composition: comp,
        name: name.trim(),
        description: description.trim() || undefined,
        image,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: spellsKey });
      resetForm();
      toast({ title: "Spell added", description: "The spell was pre-loaded into this spellbook." });
    },
    onError: (err: any) => {
      toast({ title: "Could not add spell", description: err?.message || "Something went wrong.", variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (spellId: string) => api.removeSpellFromSpellbook(spellId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: spellsKey });
    },
    onError: (err: any) => {
      toast({ title: "Could not remove spell", description: err?.message || "Something went wrong.", variant: "destructive" });
    },
  });

  if (!itemId) return null;

  return (
    <div className="space-y-3" data-testid="spellbook-library-manager">
      <div className="flex items-center justify-between">
        <span className="text-xs text-stone-400 flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5" />
          Pre-loaded spells
        </span>
        <span
          className="text-xs font-medium text-amber-300"
          data-testid="text-spellbook-count"
        >
          {count}{maxSpells > 0 ? ` / ${maxSpells}` : ""}
        </span>
      </div>

      {isLoading ? (
        <div className="text-xs text-stone-500 flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : spells.length === 0 ? (
        <p className="text-xs text-stone-500 italic">No spells pre-loaded yet.</p>
      ) : (
        <div className="space-y-1.5">
          {spells.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded border border-stone-700 bg-stone-900/60 px-2 py-1.5"
              data-testid={`row-preloaded-spell-${s.id}`}
            >
              {s.image ? (
                <img src={s.image} alt="" className="h-7 w-7 rounded object-cover" />
              ) : (
                <div className="h-7 w-7 rounded bg-stone-800 flex items-center justify-center">
                  <ImageIcon className="h-3.5 w-3.5 text-stone-600" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-stone-200 truncate">{s.name}</div>
                <div className="text-[10px] text-stone-500">{s.manaCost} mana · DC {s.craftDc}</div>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-stone-400 hover:text-red-400"
                onClick={() => removeMutation.mutate(s.id)}
                disabled={removeMutation.isPending}
                data-testid={`button-remove-preloaded-spell-${s.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {!adding ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={() => setAdding(true)}
          disabled={atCapacity}
          data-testid="button-add-preloaded-spell"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          {atCapacity ? "Spellbook full" : "Add spell"}
        </Button>
      ) : (
        <div className="rounded-lg border border-stone-700 bg-stone-900/40 p-3 space-y-3" data-testid="form-add-preloaded-spell">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-stone-400">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Spell name"
                data-testid="input-preloaded-spell-name"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-stone-400">Image</Label>
              <div className="flex items-center gap-1.5">
                {image ? (
                  <img src={image} alt="" className="h-9 w-9 rounded object-cover" />
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 text-xs"
                  onClick={() => setShowImageBrowser(true)}
                  data-testid="button-pick-preloaded-spell-image"
                >
                  <ImageIcon className="h-3.5 w-3.5 mr-1" />
                  {image ? "Change" : "Pick"}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-stone-400">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this spell do?"
              rows={2}
              data-testid="input-preloaded-spell-description"
            />
          </div>

          <V3CompositionEditor value={comp} onChange={setComp} />

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-stone-400" data-testid="text-preloaded-spell-cost">
              {manaCost} mana · DC {craftDc}{craftDc <= 0 ? " (auto)" : ""}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={resetForm}
                data-testid="button-cancel-preloaded-spell"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-stone-950"
                onClick={() => addMutation.mutate()}
                disabled={!valid || addMutation.isPending}
                data-testid="button-save-preloaded-spell"
              >
                {addMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Add to spellbook
              </Button>
            </div>
          </div>
        </div>
      )}

      <ImageBrowser
        open={showImageBrowser}
        onOpenChange={setShowImageBrowser}
        onSelect={(data) => {
          setImage(data);
          setShowImageBrowser(false);
        }}
        title="Pick spell image"
      />
    </div>
  );
}
