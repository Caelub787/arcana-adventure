import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { api, type Note, type Item, type SystemSpell, type Character } from "@/lib/api";
async function fetchJSON(url: string): Promise<any> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FloatingPanel } from "@/components/ui/floating-panel";
import { Search, FileText, Package, Sparkles, Users, Globe, X } from "lucide-react";

export type GlobalSearchResultType = "note" | "item" | "spell" | "character" | "article";

export interface GlobalSearchHandlers {
  onSelectNote: (noteId: string, title: string, type?: string) => void;
  onSelectItem: (item: Item) => void;
  onSelectSpell: (spell: SystemSpell) => void;
  onSelectCharacter: (character: Character) => void;
  onSelectEntity: (entityId: string, title: string) => void;
}

interface GlobalSearchProps extends GlobalSearchHandlers {
  open: boolean;
  onClose: () => void;
  campaignId: string;
  campaignSystem?: string;
  worldId?: string;
}

type FilterKind = "all" | "note" | "item" | "spell" | "character" | "article";

const FILTERS: { key: FilterKind; label: string; icon: any }[] = [
  { key: "all", label: "All", icon: Search },
  { key: "note", label: "Notes", icon: FileText },
  { key: "article", label: "Articles", icon: Globe },
  { key: "character", label: "Characters", icon: Users },
  { key: "item", label: "Items", icon: Package },
  { key: "spell", label: "Spells", icon: Sparkles },
];

const TYPE_ICONS: Record<GlobalSearchResultType, any> = {
  note: FileText,
  item: Package,
  spell: Sparkles,
  character: Users,
  article: Globe,
};

const TYPE_COLORS: Record<GlobalSearchResultType, string> = {
  note: "text-blue-400",
  item: "text-emerald-400",
  spell: "text-amber-400",
  character: "text-amber-400",
  article: "text-cyan-400",
};

interface SearchHit {
  type: GlobalSearchResultType;
  id: string;
  title: string;
  subtitle?: string;
  raw: any;
}

function matchScore(text: string | undefined | null, query: string): number {
  if (!text) return 0;
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (!q) return 0;
  const idx = t.indexOf(q);
  if (idx === -1) return 0;
  if (idx === 0) return 100 - Math.min(t.length, 50);
  return 50 - Math.min(idx, 49);
}

export function GlobalSearch({
  open,
  onClose,
  campaignId,
  campaignSystem,
  worldId,
  onSelectNote,
  onSelectItem,
  onSelectSpell,
  onSelectCharacter,
  onSelectEntity,
}: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKind>("all");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebouncedValue(query, 200);
  const hasQuery = debouncedQuery.trim().length >= 1;

  useEffect(() => {
    if (open) {
      setQuery("");
      setFilter("all");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Notes: server-side filtered to user-accessible
  const notesQuery = useQuery<Note[]>({
    queryKey: ["global-search-notes", debouncedQuery],
    queryFn: () => api.searchNotes(debouncedQuery),
    enabled: open && hasQuery && (filter === "all" || filter === "note"),
    staleTime: 30_000,
  });

  // Characters in this campaign — server-side filtered by user access
  const charactersQuery = useQuery<Character[]>({
    queryKey: ["global-search-characters", campaignId],
    queryFn: () => api.getCampaignCharacters(campaignId),
    enabled: open && !!campaignId && (filter === "all" || filter === "character"),
    staleTime: 30_000,
  });

  // System items (public — available in libraries to all users; pass campaignId
  // so the campaign GM's private library entries are included for members)
  const itemsQuery = useQuery<Item[]>({
    queryKey: ["global-search-items", campaignId],
    queryFn: () => api.getPublicSystemItems(campaignId),
    enabled: open && (filter === "all" || filter === "item"),
    staleTime: 60_000,
  });

  // System spells (public — available in libraries to all users; pass campaignId
  // so the campaign GM's private library entries are included for members)
  const spellsQuery = useQuery<SystemSpell[]>({
    queryKey: ["global-search-spells", campaignId],
    queryFn: () => api.getPublicSpells(campaignId),
    enabled: open && (filter === "all" || filter === "spell"),
    staleTime: 60_000,
  });

  // World wiki articles for the campaign — server-side filtered by visibility/access
  const wikiQuery = useQuery<any[]>({
    queryKey: ["global-search-wiki", worldId, debouncedQuery],
    queryFn: () => fetchJSON(`/api/worlds/${worldId}/wiki-search?q=${encodeURIComponent(debouncedQuery)}`),
    enabled: open && hasQuery && !!worldId && (filter === "all" || filter === "article"),
    staleTime: 30_000,
  });

  const results = useMemo<SearchHit[]>(() => {
    if (!hasQuery) return [];
    const q = debouncedQuery.trim();
    const ql = q.toLowerCase();
    const hits: SearchHit[] = [];

    if ((filter === "all" || filter === "note") && notesQuery.data) {
      for (const n of notesQuery.data) {
        hits.push({
          type: "note",
          id: n.id,
          title: n.title || "Untitled Note",
          subtitle: n.campaignId === campaignId ? "Campaign Note" : "Personal Note",
          raw: n,
        });
      }
    }

    if ((filter === "all" || filter === "character") && charactersQuery.data) {
      for (const c of charactersQuery.data) {
        if (matchScore(c.name, ql) > 0) {
          hits.push({
            type: "character",
            id: c.id,
            title: c.name || "Unnamed Character",
            subtitle: (c as any).species || (c as any).className || "Character",
            raw: c,
          });
        }
      }
    }

    if ((filter === "all" || filter === "item") && itemsQuery.data) {
      for (const it of itemsQuery.data) {
        // Filter to current campaign system if specified
        if (campaignSystem && (it as any).system && (it as any).system !== campaignSystem) continue;
        // Skip live templates from search results — those are admin tools
        if ((it as any).isLiveTemplate) continue;
        if (matchScore(it.name, ql) > 0) {
          hits.push({
            type: "item",
            id: it.id,
            title: it.name || "Unnamed Item",
            subtitle: (it as any).itemType || "Item",
            raw: it,
          });
        }
      }
    }

    if ((filter === "all" || filter === "spell") && spellsQuery.data) {
      for (const sp of spellsQuery.data) {
        if (campaignSystem && (sp as any).system && (sp as any).system !== campaignSystem) continue;
        if ((sp as any).isLiveTemplate) continue;
        if (matchScore(sp.name, ql) > 0) {
          hits.push({
            type: "spell",
            id: sp.id,
            title: sp.name || "Unnamed Spell",
            subtitle: (sp as any).spellType || "Spell",
            raw: sp,
          });
        }
      }
    }

    if ((filter === "all" || filter === "article") && wikiQuery.data) {
      for (const e of wikiQuery.data) {
        // Wiki-search returns mixed result types; only consume true entity articles
        // here. Items/spells/characters surface via their dedicated queries above
        // with proper per-user access enforcement.
        if (e.type && e.type !== "entity") continue;
        hits.push({
          type: "article",
          id: e.id,
          title: e.displayName || e.name || "Untitled",
          subtitle: e.category || e.entityType || "Article",
          raw: e,
        });
      }
    }

    // Sort: by best name-match score then alphabetical
    hits.sort((a, b) => {
      const sa = matchScore(a.title, ql);
      const sb = matchScore(b.title, ql);
      if (sb !== sa) return sb - sa;
      return a.title.localeCompare(b.title);
    });

    return hits.slice(0, 60);
  }, [
    hasQuery,
    debouncedQuery,
    filter,
    campaignId,
    campaignSystem,
    notesQuery.data,
    charactersQuery.data,
    itemsQuery.data,
    spellsQuery.data,
    wikiQuery.data,
  ]);

  useEffect(() => {
    setActiveIndex(0);
  }, [debouncedQuery, filter, results.length]);

  const handleSelect = (hit: SearchHit) => {
    switch (hit.type) {
      case "note":
        onSelectNote(hit.id, hit.title, (hit.raw as Note).type);
        break;
      case "item":
        onSelectItem(hit.raw as Item);
        break;
      case "spell":
        onSelectSpell(hit.raw as SystemSpell);
        break;
      case "character":
        onSelectCharacter(hit.raw as Character);
        break;
      case "article":
        onSelectEntity(hit.id, hit.title);
        break;
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = results[activeIndex];
      if (hit) handleSelect(hit);
    }
  };

  if (!open) return null;

  const isLoading =
    (notesQuery.isFetching && (filter === "all" || filter === "note")) ||
    (wikiQuery.isFetching && (filter === "all" || filter === "article"));

  return (
    <FloatingPanel
      panelKey="global-search"
      open={open}
      onClose={onClose}
      title="Quick Search"
      defaultPosition={{ x: Math.max(0, (window.innerWidth - 560) / 2), y: 80 }}
      defaultSize={{ width: 560, height: 480 }}
      minWidth={380}
      minHeight={300}
      zIndex={20000}
    >
      <div
        className="flex h-full flex-col bg-stone-900"
        onKeyDown={handleKeyDown}
      >
        <div className="border-b border-stone-700 p-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
            <Input
              ref={inputRef}
              data-testid="input-global-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes, items, spells, characters, articles…"
              className="pl-9 pr-9 bg-stone-800 border-stone-700 text-stone-200"
            />
            {query && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-stone-500 hover:text-stone-200"
                onClick={() => setQuery("")}
                data-testid="button-global-search-clear"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => {
              const Icon = f.icon;
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
                    active
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                      : "bg-stone-800 text-stone-400 border border-stone-700 hover:text-stone-200"
                  }`}
                  data-testid={`filter-global-search-${f.key}`}
                >
                  <Icon className="h-3 w-3" />
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2">
            {!hasQuery && (
              <div className="px-3 py-8 text-center text-sm text-stone-500">
                Start typing to search across your campaign…
                <div className="mt-2 text-xs text-stone-600">
                  Press <kbd className="px-1 py-0.5 rounded bg-stone-800 border border-stone-700">↑</kbd>{" "}
                  <kbd className="px-1 py-0.5 rounded bg-stone-800 border border-stone-700">↓</kbd> to
                  navigate, <kbd className="px-1 py-0.5 rounded bg-stone-800 border border-stone-700">Enter</kbd>{" "}
                  to open.
                </div>
              </div>
            )}
            {hasQuery && results.length === 0 && !isLoading && (
              <div className="px-3 py-8 text-center text-sm text-stone-500">
                No results found.
              </div>
            )}
            {hasQuery && results.length === 0 && isLoading && (
              <div className="px-3 py-8 text-center text-sm text-stone-500">Searching…</div>
            )}
            {results.map((hit, i) => {
              const Icon = TYPE_ICONS[hit.type];
              const colorCls = TYPE_COLORS[hit.type];
              const active = i === activeIndex;
              return (
                <button
                  key={`${hit.type}-${hit.id}`}
                  type="button"
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => handleSelect(hit)}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${
                    active ? "bg-stone-800" : "hover:bg-stone-800/60"
                  }`}
                  data-testid={`result-global-search-${hit.type}-${hit.id}`}
                >
                  <Icon className={`h-4 w-4 flex-shrink-0 ${colorCls}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-stone-200">{hit.title}</div>
                    {hit.subtitle && (
                      <div className="truncate text-xs text-stone-500">{hit.subtitle}</div>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] uppercase ${colorCls} border-current`}
                  >
                    {hit.type}
                  </Badge>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </FloatingPanel>
  );
}

interface SimplePreviewPanelProps {
  panelKey: string;
  title: string;
  imageUrl?: string | null;
  subtitle?: string;
  description?: string | null;
  fields?: { label: string; value: string | number | null | undefined }[];
  zIndex?: number;
  onClose: () => void;
  onBringToFront?: () => void;
  defaultPosition?: { x: number; y: number };
}

export function SearchPreviewPanel({
  panelKey,
  title,
  imageUrl,
  subtitle,
  description,
  fields,
  zIndex,
  onClose,
  onBringToFront,
  defaultPosition,
}: SimplePreviewPanelProps) {
  return (
    <FloatingPanel
      panelKey={panelKey}
      open={true}
      onClose={onClose}
      onBringToFront={onBringToFront}
      title={title}
      defaultPosition={defaultPosition}
      defaultSize={{ width: 380, height: 460 }}
      minWidth={300}
      minHeight={250}
      zIndex={zIndex}
    >
      <div className="flex h-full flex-col bg-stone-900 text-stone-200">
        {imageUrl && (
          <div
            className="h-40 w-full flex-shrink-0 bg-stone-800 bg-cover bg-center"
            style={{ backgroundImage: `url(${imageUrl})` }}
          />
        )}
        <div className="border-b border-stone-700 px-4 py-3">
          <div className="text-lg font-semibold text-amber-400">{title}</div>
          {subtitle && <div className="text-xs uppercase text-stone-500 mt-0.5">{subtitle}</div>}
        </div>
        <ScrollArea className="flex-1">
          <div className="space-y-3 px-4 py-3">
            {fields && fields.filter(f => f.value !== null && f.value !== undefined && f.value !== "").length > 0 && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                {fields
                  .filter(f => f.value !== null && f.value !== undefined && f.value !== "")
                  .map((f, i) => (
                    <div key={i} className="rounded bg-stone-800/60 px-2 py-1.5">
                      <div className="text-[10px] uppercase text-stone-500">{f.label}</div>
                      <div className="text-stone-200">{String(f.value)}</div>
                    </div>
                  ))}
              </div>
            )}
            {description && (
              <div className="text-sm text-stone-300 whitespace-pre-wrap leading-relaxed">
                {description}
              </div>
            )}
            {!description && (!fields || fields.every(f => !f.value)) && (
              <div className="text-sm text-stone-500 italic">No additional details.</div>
            )}
          </div>
        </ScrollArea>
      </div>
    </FloatingPanel>
  );
}
