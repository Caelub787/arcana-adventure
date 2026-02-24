import React, { useState, useCallback, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSearchEntities, ENTITY_TYPE_CONFIG, type Entity } from "@/lib/worldbuilding-api";
import { Search, User, MapPin, Shield, Scroll, Calendar, BookOpen, Package, Swords, X } from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  User, MapPin, Shield, Scroll, Calendar, BookOpen, Package, Swords, Search,
};

interface EntityPickerProps {
  campaignId: string;
  onSelect: (entity: Entity) => void;
  onCancel?: () => void;
  filterType?: string;
  excludeIds?: string[];
  placeholder?: string;
}

export function EntityPicker({ campaignId, onSelect, onCancel, filterType, excludeIds = [], placeholder = "Search entities..." }: EntityPickerProps) {
  const [query, setQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string | undefined>(filterType);
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: results = [], isLoading } = useSearchEntities(campaignId, query, selectedType);
  const filtered = results.filter(e => !excludeIds.includes(e.id));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = useCallback((entity: Entity) => {
    onSelect(entity);
    setQuery("");
    setIsOpen(false);
  }, [onSelect]);

  return (
    <div className="relative" data-testid="entity-picker">
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-stone-500" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
            onFocus={() => query.length > 0 && setIsOpen(true)}
            placeholder={placeholder}
            className="pl-9 bg-stone-900 border-stone-700 text-stone-200 placeholder:text-stone-500"
            data-testid="input-entity-search"
          />
        </div>
        {!filterType && (
          <select
            value={selectedType || ""}
            onChange={(e) => setSelectedType(e.target.value || undefined)}
            className="bg-stone-900 border border-stone-700 text-stone-300 text-xs rounded px-2 py-2"
            data-testid="select-entity-type-filter"
          >
            <option value="">All Types</option>
            {Object.entries(ENTITY_TYPE_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
        )}
        {onCancel && (
          <Button variant="ghost" size="icon" onClick={onCancel} className="text-stone-400 hover:text-stone-200" data-testid="button-cancel-picker">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {isOpen && query.length > 0 && (
        <div ref={dropdownRef} className="absolute z-50 mt-1 w-full bg-stone-900 border border-stone-700 rounded-md shadow-xl max-h-64 overflow-y-auto" data-testid="entity-picker-results">
          {isLoading && <div className="p-3 text-stone-500 text-sm">Searching...</div>}
          {!isLoading && filtered.length === 0 && (
            <div className="p-3 text-stone-500 text-sm">No entities found</div>
          )}
          {filtered.map((entity) => {
            const cfg = ENTITY_TYPE_CONFIG[entity.entityType];
            const IconComp = cfg ? ICON_MAP[cfg.icon] || Search : Search;
            return (
              <button
                key={entity.id}
                onClick={() => handleSelect(entity)}
                className="w-full text-left px-3 py-2 hover:bg-stone-800 flex items-center gap-3 border-b border-stone-800 last:border-0 transition-colors"
                data-testid={`entity-picker-result-${entity.id}`}
              >
                <div className="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center" style={{ backgroundColor: cfg?.color + "22" }}>
                  <IconComp className="h-4 w-4" style={{ color: cfg?.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-stone-200 truncate">{entity.displayName}</div>
                  <div className="text-xs text-stone-500 truncate">{cfg?.label || entity.entityType}</div>
                </div>
                {entity.tags && entity.tags.length > 0 && (
                  <div className="flex gap-1">
                    {entity.tags.slice(0, 2).map(tag => (
                      <Badge key={tag} variant="outline" className="text-[10px] px-1 border-stone-700 text-stone-400">{tag}</Badge>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
