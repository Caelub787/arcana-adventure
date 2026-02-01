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
  FileText,
  Plus,
} from "lucide-react";
import type { Note } from "@/lib/api";

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
  { value: "character", label: "Characters", icon: Swords },
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
    case "character":
      return <Swords className="h-4 w-4" />;
    case "note":
      return <FileText className="h-4 w-4" />;
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
    case "character":
      return "bg-indigo-900/50 text-indigo-300 border-indigo-700";
    case "note":
      return "bg-cyan-900/50 text-cyan-300 border-cyan-700";
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
    enabled: open, // Fetch when open - show all entities when search is empty
    staleTime: 1000 * 60 * 5,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });

  useEffect(() => {
    // Don't auto-focus - let user tap to search when ready
    if (!open) {
      setSearchQuery("");
      setSelectedType("all");
    }
  }, [open]);

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
            ) : showLoading ? (
              <div className="flex items-center justify-center py-8 text-stone-500">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                {searchQuery.length === 0 ? "Loading..." : "Searching..."}
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
      <span
        key={`${type}-${id}-${match.index}`}
        className="text-blue-400 hover:text-blue-300 cursor-pointer font-medium"
        data-testid={`reference-link-${id}`}
      >
        [[{label}]]
      </span>
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return <>{parts}</>;
}

interface NoteOnlyPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notes: Note[];
  onSelectNote: (note: Note) => void;
  onCreateNote: (name: string) => void;
  initialSearch?: string;
}

export function NoteOnlyPicker({
  open,
  onOpenChange,
  notes,
  onSelectNote,
  onCreateNote,
  initialSearch = "",
}: NoteOnlyPickerProps) {
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSearchQuery(initialSearch);
      // Don't auto-focus the input - let user continue typing in textarea
    }
  }, [open, initialSearch]);

  const filteredNotes = notes.filter(note => 
    note.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const exactMatch = notes.find(note => 
    note.title.toLowerCase() === searchQuery.toLowerCase()
  );

  const showCreateOption = searchQuery.trim().length > 0 && !exactMatch;

  const handleSelectNote = (note: Note) => {
    onSelectNote(note);
    onOpenChange(false);
    setSearchQuery("");
  };

  const handleCreateNote = () => {
    if (searchQuery.trim()) {
      onCreateNote(searchQuery.trim());
      onOpenChange(false);
      setSearchQuery("");
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange} modal={false}>
      <PopoverContent
        className="w-72 p-0 bg-stone-950 border-stone-800"
        align="start"
        side="bottom"
        sideOffset={5}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="p-3 border-b border-stone-800">
          <div className="relative">
            <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-cyan-500" />
            <Input
              ref={inputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search or create note..."
              className="pl-9 bg-stone-900 border-stone-700 text-sm"
              data-testid="input-note-search"
              onKeyDown={(e) => {
                if (e.key === "Enter" && showCreateOption) {
                  handleCreateNote();
                }
              }}
            />
          </div>
        </div>

        <ScrollArea className="max-h-60">
          <div className="p-2">
            {showCreateOption && (
              <button
                onClick={handleCreateNote}
                className="w-full flex items-center gap-3 p-2 rounded hover:bg-cyan-900/30 transition-colors text-left border border-dashed border-cyan-700/50 mb-2"
                data-testid="button-create-note-from-picker"
              >
                <div className="p-2 rounded bg-cyan-900/50 text-cyan-300">
                  <Plus className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-cyan-300">
                    Create "{searchQuery}"
                  </span>
                  <p className="text-xs text-stone-500">Create new note and link</p>
                </div>
              </button>
            )}

            {filteredNotes.length === 0 && !showCreateOption ? (
              <div className="text-center py-6 text-stone-500 text-sm">
                No notes found
              </div>
            ) : (
              <div className="space-y-1">
                {filteredNotes.slice(0, 20).map((note) => (
                  <button
                    key={note.id}
                    onClick={() => handleSelectNote(note)}
                    className="w-full flex items-center gap-3 p-2 rounded hover:bg-stone-800/50 transition-colors text-left"
                    data-testid={`note-result-${note.id}`}
                  >
                    <div className="p-2 rounded bg-cyan-900/50 text-cyan-300">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-stone-200 truncate block">
                        {note.title}
                      </span>
                    </div>
                  </button>
                ))}
                {filteredNotes.length > 20 && (
                  <p className="text-xs text-stone-500 text-center py-2">
                    Showing first 20 results
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

export { getEntityIcon, getEntityColor };
