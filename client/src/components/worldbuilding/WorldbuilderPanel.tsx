import React, { useState, useMemo } from "react";
import { useEntities, useCreateEntity, useDeleteEntity, useUpdateEntity, useWorldbuildingSync, ENTITY_TYPE_CONFIG, type Entity } from "@/lib/worldbuilding-api";
import { EntityPreviewPanel } from "./EntityPreviewPanel";
import { EntitySidePanel } from "./EntitySidePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, Globe, User, MapPin, Shield, Scroll, Calendar, BookOpen, Package, Swords, Filter, ChevronDown, X } from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  User, MapPin, Shield, Scroll, Calendar, BookOpen, Package, Swords, Search,
};

interface WorldbuilderPanelProps {
  campaignId?: string;
  worldId?: string;
  isGM: boolean;
  characters?: any[];
  onOpenEntity?: (entityId: string) => void;
  createOnly?: boolean;
  onCloseCreate?: () => void;
}

export function WorldbuilderPanel({ campaignId, worldId, isGM, characters = [], onOpenEntity, createOnly = false, onCloseCreate }: WorldbuilderPanelProps) {
  const resolvedId = worldId || campaignId;
  useWorldbuildingSync(resolvedId);
  const { data: entities = [], isLoading } = useEntities(resolvedId);
  const createEntity = useCreateEntity(resolvedId);
  const deleteEntity = useDeleteEntity(resolvedId);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("");
  const [showCreateDialog, setShowCreateDialog] = useState(createOnly);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const [newEntity, setNewEntity] = useState({
    displayName: "",
    entityType: "character",
    description: "",
    visibility: "gm_only",
    sheetId: "",
    tags: "",
  });

  const filteredEntities = useMemo(() => {
    let result = entities;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e => e.displayName.toLowerCase().includes(q) || e.description?.toLowerCase().includes(q));
    }
    if (filterType) {
      result = result.filter(e => e.entityType === filterType);
    }
    return result.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [entities, searchQuery, filterType]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    entities.forEach(e => { counts[e.entityType] = (counts[e.entityType] || 0) + 1; });
    return counts;
  }, [entities]);

  const handleCreate = async () => {
    if (!newEntity.displayName.trim()) return;
    await createEntity.mutateAsync({
      worldId: worldId || undefined,
      campaignId: campaignId || undefined,
      displayName: newEntity.displayName.trim(),
      entityType: newEntity.entityType,
      description: newEntity.description.trim() || undefined,
      visibility: newEntity.visibility,
      sheetId: newEntity.sheetId || undefined,
      tags: newEntity.tags ? newEntity.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
    } as any);
    setShowCreateDialog(false);
    setNewEntity({ displayName: "", entityType: "character", description: "", visibility: "gm_only", sheetId: "", tags: "" });
    if (createOnly && onCloseCreate) onCloseCreate();
  };

  const handleEntityClick = (entityId: string) => {
    if (onOpenEntity) {
      onOpenEntity(entityId);
    } else {
      setSelectedEntityId(entityId);
    }
  };

  if (createOnly) {
    return (
      <Dialog open={showCreateDialog} onOpenChange={(open) => { setShowCreateDialog(open); if (!open && onCloseCreate) onCloseCreate(); }}>
        <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 max-w-md" data-testid="dialog-create-entity">
          <DialogHeader>
            <DialogTitle className="text-stone-100">Create New Article</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-stone-400">Type</Label>
              <select
                value={newEntity.entityType}
                onChange={(e) => setNewEntity(p => ({ ...p, entityType: e.target.value }))}
                className="w-full mt-1 bg-stone-800 border border-stone-700 text-stone-200 rounded px-2 py-2 text-sm"
                data-testid="select-entity-type"
              >
                {Object.entries(ENTITY_TYPE_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs text-stone-400">Name</Label>
              <Input
                value={newEntity.displayName}
                onChange={(e) => setNewEntity(p => ({ ...p, displayName: e.target.value }))}
                placeholder="Entity name..."
                className="mt-1 bg-stone-800 border-stone-700 text-stone-200"
                data-testid="input-entity-name"
              />
            </div>
            <div>
              <Label className="text-xs text-stone-400">Description</Label>
              <Textarea
                value={newEntity.description}
                onChange={(e) => setNewEntity(p => ({ ...p, description: e.target.value }))}
                placeholder="Brief description..."
                className="mt-1 bg-stone-800 border-stone-700 text-stone-200 min-h-[60px]"
                data-testid="input-entity-description"
              />
            </div>
            <div>
              <Label className="text-xs text-stone-400">Visibility</Label>
              <select
                value={newEntity.visibility}
                onChange={(e) => setNewEntity(p => ({ ...p, visibility: e.target.value }))}
                className="w-full mt-1 bg-stone-800 border border-stone-700 text-stone-200 rounded px-2 py-2 text-sm"
                data-testid="select-entity-visibility"
              >
                <option value="gm_only">GM Only</option>
                <option value="shared">Shared</option>
                <option value="player_visible">Player Visible</option>
              </select>
            </div>
            {newEntity.entityType === "character" && characters.length > 0 && (
              <div>
                <Label className="text-xs text-stone-400">Link to Existing Character Sheet</Label>
                <select
                  value={newEntity.sheetId}
                  onChange={(e) => setNewEntity(p => ({ ...p, sheetId: e.target.value }))}
                  className="w-full mt-1 bg-stone-800 border border-stone-700 text-stone-200 rounded px-2 py-2 text-sm"
                  data-testid="select-link-sheet"
                >
                  <option value="">None (create without sheet)</option>
                  {characters.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name} (Lv.{c.level})</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <Label className="text-xs text-stone-400">Tags (comma separated)</Label>
              <Input
                value={newEntity.tags}
                onChange={(e) => setNewEntity(p => ({ ...p, tags: e.target.value }))}
                placeholder="npc, quest-giver, important..."
                className="mt-1 bg-stone-800 border-stone-700 text-stone-200"
                data-testid="input-entity-tags"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowCreateDialog(false); onCloseCreate?.(); }} className="text-stone-400" data-testid="button-cancel-create">Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!newEntity.displayName.trim() || createEntity.isPending}
              className="bg-amber-600 hover:bg-amber-500 text-white"
              data-testid="button-confirm-create"
            >
              {createEntity.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full" data-testid="worldbuilder-panel">
        <div className="p-3 space-y-2 border-b border-stone-700">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
              <Globe className="h-4 w-4 text-amber-400" />
              World Builder
            </h2>
            {isGM && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCreateDialog(true)}
                className="text-xs text-amber-400 hover:text-amber-300 h-7"
                data-testid="button-create-entity"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> New
              </Button>
            )}
          </div>
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-stone-500" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search world..."
                className="pl-7 h-8 text-xs bg-stone-800 border-stone-700 text-stone-200"
                data-testid="input-worldbuilder-search"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowFilters(!showFilters)}
              className={`h-8 w-8 ${showFilters ? 'text-amber-400' : 'text-stone-500'}`}
              data-testid="button-toggle-filters"
            >
              <Filter className="h-3.5 w-3.5" />
            </Button>
          </div>
          {showFilters && (
            <div className="flex flex-wrap gap-1">
              <Badge
                variant={filterType === "" ? "default" : "outline"}
                className={`text-[10px] cursor-pointer ${filterType === "" ? "bg-amber-500/20 text-amber-400 border-amber-500/50" : "border-stone-700 text-stone-500 hover:text-stone-300"}`}
                onClick={() => setFilterType("")}
              >
                All ({entities.length})
              </Badge>
              {Object.entries(ENTITY_TYPE_CONFIG).map(([key, cfg]) => {
                const count = typeCounts[key] || 0;
                if (count === 0 && !isGM) return null;
                return (
                  <Badge
                    key={key}
                    variant={filterType === key ? "default" : "outline"}
                    className={`text-[10px] cursor-pointer ${filterType === key ? "text-white" : "border-stone-700 text-stone-500 hover:text-stone-300"}`}
                    style={filterType === key ? { backgroundColor: cfg.color + "33", color: cfg.color, borderColor: cfg.color + "55" } : {}}
                    onClick={() => setFilterType(filterType === key ? "" : key)}
                  >
                    {cfg.label} ({count})
                  </Badge>
                );
              })}
            </div>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {isLoading && (
              <div className="space-y-2 p-2">
                {[1,2,3].map(i => <div key={i} className="h-14 bg-stone-800 rounded animate-pulse" />)}
              </div>
            )}
            {!isLoading && filteredEntities.length === 0 && (
              <div className="text-center py-8 text-stone-500">
                <Globe className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-xs">{searchQuery ? "No entities match your search" : "No entities yet"}</p>
                {isGM && !searchQuery && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCreateDialog(true)}
                    className="text-xs text-amber-400 mt-2"
                  >
                    <Plus className="h-3 w-3 mr-1" /> Create your first entity
                  </Button>
                )}
              </div>
            )}
            {filteredEntities.map((entity) => {
              const cfg = ENTITY_TYPE_CONFIG[entity.entityType];
              const IconComp = cfg ? ICON_MAP[cfg.icon] || Search : Search;
              return (
                <button
                  key={entity.id}
                  onClick={() => handleEntityClick(entity.id)}
                  className="w-full text-left px-2.5 py-2 rounded-md hover:bg-stone-800/60 transition-colors group flex items-center gap-2.5"
                  data-testid={`entity-list-item-${entity.id}`}
                >
                  <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: cfg?.color + "18" }}>
                    <IconComp className="h-3.5 w-3.5" style={{ color: cfg?.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-stone-300 truncate group-hover:text-stone-100">{entity.displayName}</div>
                    {entity.description && (
                      <div className="text-[10px] text-stone-500 truncate">{entity.description}</div>
                    )}
                  </div>
                  {entity.sheetId && <User className="h-3 w-3 text-stone-600" />}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={(open) => { setShowCreateDialog(open); if (!open && createOnly && onCloseCreate) onCloseCreate(); }}>
        <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 max-w-md" data-testid="dialog-create-entity">
          <DialogHeader>
            <DialogTitle className="text-stone-100">Create Entity</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-stone-400">Type</Label>
              <select
                value={newEntity.entityType}
                onChange={(e) => setNewEntity(p => ({ ...p, entityType: e.target.value }))}
                className="w-full mt-1 bg-stone-800 border border-stone-700 text-stone-200 rounded px-2 py-2 text-sm"
                data-testid="select-entity-type"
              >
                {Object.entries(ENTITY_TYPE_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs text-stone-400">Name</Label>
              <Input
                value={newEntity.displayName}
                onChange={(e) => setNewEntity(p => ({ ...p, displayName: e.target.value }))}
                placeholder="Entity name..."
                className="mt-1 bg-stone-800 border-stone-700 text-stone-200"
                data-testid="input-entity-name"
              />
            </div>
            <div>
              <Label className="text-xs text-stone-400">Description</Label>
              <Textarea
                value={newEntity.description}
                onChange={(e) => setNewEntity(p => ({ ...p, description: e.target.value }))}
                placeholder="Brief description..."
                className="mt-1 bg-stone-800 border-stone-700 text-stone-200 min-h-[60px]"
                data-testid="input-entity-description"
              />
            </div>
            <div>
              <Label className="text-xs text-stone-400">Visibility</Label>
              <select
                value={newEntity.visibility}
                onChange={(e) => setNewEntity(p => ({ ...p, visibility: e.target.value }))}
                className="w-full mt-1 bg-stone-800 border border-stone-700 text-stone-200 rounded px-2 py-2 text-sm"
                data-testid="select-entity-visibility"
              >
                <option value="gm_only">GM Only</option>
                <option value="shared">Shared</option>
                <option value="player_visible">Player Visible</option>
              </select>
            </div>
            {newEntity.entityType === "character" && characters.length > 0 && (
              <div>
                <Label className="text-xs text-stone-400">Link to Existing Character Sheet</Label>
                <select
                  value={newEntity.sheetId}
                  onChange={(e) => setNewEntity(p => ({ ...p, sheetId: e.target.value }))}
                  className="w-full mt-1 bg-stone-800 border border-stone-700 text-stone-200 rounded px-2 py-2 text-sm"
                  data-testid="select-link-sheet"
                >
                  <option value="">None (create without sheet)</option>
                  {characters.map(c => (
                    <option key={c.id} value={c.id}>{c.name} (Lv.{c.level})</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <Label className="text-xs text-stone-400">Tags (comma separated)</Label>
              <Input
                value={newEntity.tags}
                onChange={(e) => setNewEntity(p => ({ ...p, tags: e.target.value }))}
                placeholder="npc, quest-giver, important..."
                className="mt-1 bg-stone-800 border-stone-700 text-stone-200"
                data-testid="input-entity-tags"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreateDialog(false)} className="text-stone-400" data-testid="button-cancel-create">Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!newEntity.displayName.trim() || createEntity.isPending}
              className="bg-amber-600 hover:bg-amber-500 text-white"
              data-testid="button-confirm-create"
            >
              {createEntity.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedEntityId && (
        <EntitySidePanel
          worldId={resolvedId}
          entityId={selectedEntityId}
          onClose={() => setSelectedEntityId(null)}
          onNavigateToEntity={(id) => setSelectedEntityId(id)}
          isGM={isGM}
        />
      )}
    </>
  );
}
