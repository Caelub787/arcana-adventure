import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Checkbox } from "@/components/ui/checkbox";
import { Hammer, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";

/**
 * Links a crafter item to one or more Crafter Recipe Templates: ticking a
 * template copies its recipes onto the item (kept in sync on later template
 * edits), unticking removes the inherited copies. Shared between the admin
 * item editor and My Library so both authoring surfaces offer the same way
 * to attach template recipes to a crafter.
 */
export function CrafterTemplateLinksPanel({ itemId, systemSlug, personal }: { itemId: string; systemSlug: string; personal?: boolean }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const { data: templates = [] } = useQuery<any[]>({
    queryKey: ['crafter-recipe-templates', systemSlug, personal],
    queryFn: () => api.listCrafterRecipeTemplates(systemSlug, personal),
    enabled: systemSlug === 'aa-v2' || systemSlug === 'aa-v3' || systemSlug === 'ca',
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
      queryClient.invalidateQueries({ queryKey: ['craft-recipes-play', itemId] });
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
