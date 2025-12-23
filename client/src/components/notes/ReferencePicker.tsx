import React, { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, SearchableEntity } from "@/lib/api";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sparkles,
  Swords,
  Shield,
  Zap,
  Users,
  Package,
  Search,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

interface ReferencePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (entity: SearchableEntity) => void;
  triggerElement?: React.ReactNode;
  position?: { top: number; left: number };
}

const ENTITY_TYPES = [
  { value: "all", label: "All", icon: Search },
  { value: "spell", label: "Spells", icon: Sparkles },
  { value: "item", label: "Items", icon: Package },
  { value: "trait", label: "Traits", icon: Shield },
  { value: "skill", label: "Skills", icon: Zap },
  { value: "species", label: "Species", icon: Users },
];

const MAX_RESULTS = 50;

function getEntityIcon(type: string) {
  switch (type) {
    case "spell":
      return <Sparkles className="h-4 w-4" />;
    case "item":
      return <Package className="h-4 w-4" />;
    case "trait":
      return <Shield className="h-4 w-4" />;
    case "skill":
      return <Zap className="h-4 w-4" />;
    case "species":
      return <Users className="h-4 w-4" />;
    default:
      return <Swords className="h-4 w-4" />;
  }
}

function getEntityColor(type: string) {
  switch (type) {
    case "spell":
      return "bg-purple-900/50 text-purple-300 border-purple-700";
    case "item":
      return "bg-amber-900/50 text-amber-300 border-amber-700";
    case "trait":
      return "bg-blue-900/50 text-blue-300 border-blue-700";
    case "skill":
      return "bg-green-900/50 text-green-300 border-green-700";
    case "species":
      return "bg-rose-900/50 text-rose-300 border-rose-700";
    default:
      return "bg-stone-800/50 text-stone-300 border-stone-700";
  }
}

export function ReferencePicker({
  open,
  onOpenChange,
  onSelect,
  triggerElement,
}: ReferencePickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const { data: entities = [], isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["/api/search/entities", debouncedSearch, selectedType],
    queryFn: async () => {
      const results = await api.searchEntities(debouncedSearch, selectedType);
      return results.slice(0, MAX_RESULTS);
    },
    enabled: open, // Always enabled when picker is open - show all entities when search is empty
    staleTime: 1000 * 60 * 5,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });

  useEffect(() => {
    if (open) {
      if (inputRef.current) {
        setTimeout(() => inputRef.current?.focus(), 0);
      }

      const popularTypes = ["spell", "item", "trait"];
      popularTypes.forEach((type) => {
        queryClient.prefetchQuery({
          queryKey: ["/api/search/entities", "", type],
          queryFn: async () => {
            const results = await api.searchEntities("", type);
            return results.slice(0, MAX_RESULTS);
          },
          staleTime: 1000 * 60 * 5,
        });
      });
    }
    if (!open) {
      setSearchQuery("");
      setSelectedType("all");
    }
  }, [open, queryClient]);

  const handleSelect = (entity: SearchableEntity) => {
    onSelect(entity);
    onOpenChange(false);
  };

  const handleRetry = () => {
    refetch();
  };

  const isSearching = searchQuery !== debouncedSearch;
  const showLoading = isLoading || isFetching || isSearching;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {triggerElement && <PopoverTrigger asChild>{triggerElement}</PopoverTrigger>}
      <PopoverContent
        className="w-80 p-0 bg-stone-950 border-stone-800"
        align="start"
        side="bottom"
        sideOffset={5}
      >
        <div className="p-3 border-b border-stone-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
            <Input
              ref={inputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search entities..."
              className="pl-9 bg-stone-900 border-stone-700 text-sm"
              data-testid="input-reference-search"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500 animate-spin" />
            )}
          </div>
        </div>

        <Tabs value={selectedType} onValueChange={setSelectedType} className="px-3 py-2">
          <TabsList className="w-full bg-stone-900/50 p-0.5 h-auto flex-wrap">
            {ENTITY_TYPES.map((type) => (
              <TabsTrigger
                key={type.value}
                value={type.value}
                className="flex-1 text-xs px-2 py-1 data-[state=active]:bg-amber-900/50 data-[state=active]:text-amber-300"
                data-testid={`tab-entity-${type.value}`}
              >
                <type.icon className="h-3 w-3 mr-1" />
                {type.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <ScrollArea className="h-60">
          <div className="p-2">
            {isError ? (
              <div className="flex flex-col items-center justify-center py-8 text-stone-500">
                <AlertCircle className="h-8 w-8 text-red-500 mb-2" />
                <p className="text-sm text-red-400 mb-2">Failed to load entities</p>
                <p className="text-xs text-stone-500 mb-3 text-center px-4">
                  {error instanceof Error ? error.message : "An error occurred"}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetry}
                  className="text-xs"
                  data-testid="button-retry-search"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Retry
                </Button>
              </div>
            ) : showLoading && debouncedSearch.length > 0 ? (
              <div className="flex items-center justify-center py-8 text-stone-500">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Searching...
              </div>
            ) : searchQuery.length === 0 ? (
              <div className="text-center py-8 text-stone-500 text-sm">
                Type to search for entities
              </div>
            ) : entities.length === 0 ? (
              <div className="text-center py-8 text-stone-500 text-sm">
                No entities found
              </div>
            ) : (
              <div className="space-y-1">
                {entities.map((entity) => (
                  <button
                    key={`${entity.type}-${entity.id}`}
                    onClick={() => handleSelect(entity)}
                    className="w-full flex items-start gap-3 p-2 rounded hover:bg-stone-800/50 transition-colors text-left group"
                    data-testid={`entity-result-${entity.id}`}
                  >
                    <div className={`p-2 rounded ${getEntityColor(entity.type)}`}>
                      {getEntityIcon(entity.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-stone-200 truncate">
                          {entity.name}
                        </span>
                        <Badge variant="outline" className={`text-xs px-1.5 py-0 ${getEntityColor(entity.type)}`}>
                          {entity.type}
                        </Badge>
                      </div>
                      {entity.description && (
                        <p className="text-xs text-stone-500 line-clamp-1 mt-0.5">
                          {entity.description}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
                {entities.length === MAX_RESULTS && (
                  <p className="text-xs text-stone-500 text-center py-2">
                    Showing first {MAX_RESULTS} results. Refine your search for more specific results.
                  </p>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export function ReferenceInlineDisplay({ content }: { content: string }) {
  const referencePattern = /\[\[(\w+):([^\|]+)\|([^\]]+)\]\]/g;
  const parts: (string | React.ReactNode)[] = [];
  let lastIndex = 0;
  let match;

  while ((match = referencePattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }

    const [_, type, id, label] = match;
    parts.push(
      <Badge
        key={`${type}-${id}-${match.index}`}
        variant="outline"
        className={`inline-flex items-center gap-1 mx-0.5 text-xs cursor-pointer hover:opacity-80 ${getEntityColor(type)}`}
        data-testid={`reference-badge-${id}`}
      >
        {getEntityIcon(type)}
        {label}
      </Badge>
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return <>{parts}</>;
}

export { getEntityIcon, getEntityColor };
