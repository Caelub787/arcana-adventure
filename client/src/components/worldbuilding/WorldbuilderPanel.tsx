import React, { useState, useMemo } from "react";
import { useEntities, useCreateEntity, useDeleteEntity, useUpdateEntity, useWorldbuildingSync, ENTITY_TYPE_CONFIG, TAG_COLORS, type Entity } from "@/lib/worldbuilding-api";
import { PREDEFINED_TAGS } from "@shared/schema";
import { EntityPreviewPanel } from "./EntityPreviewPanel";
import { EntitySidePanel } from "./EntitySidePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, Globe, User, MapPin, Shield, Scroll, Calendar, BookOpen, Package, Swords, Filter, ChevronDown, X, FileText, Layout, Tag, ExternalLink } from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  User, MapPin, Shield, Scroll, Calendar, BookOpen, Package, Swords, Search, FileText, Layout,
};

interface WorldbuilderPanelProps {
  campaignId?: string;
  worldId?: string;
  isGM: boolean;
  characters?: any[];
  onOpenEntity?: (entityId: string, title?: string) => void;
  onOpenEntityNewTab?: (entityId: string, title?: string) => void;
  onEntityContextMenu?: (e: React.MouseEvent, entityId: string, entityName: string) => void;
  onEntityCreated?: (entityId: string, title: string) => void;
  createOnly?: boolean;
  onCloseCreate?: () => void;
  customTags?: string[];
  skipSync?: boolean;
  gridView?: boolean;
}

export function WorldbuilderPanel({ campaignId, worldId, isGM, characters = [], onOpenEntity, onOpenEntityNewTab, onEntityContextMenu, onEntityCreated, createOnly = false, onCloseCreate, customTags = [], skipSync = false, gridView = false }: WorldbuilderPanelProps) {
  const resolvedId = worldId || campaignId;
  useWorldbuildingSync(skipSync ? undefined : resolvedId);
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
    entityType: "article",
    description: "",
    visibility: "shared",
    sheetId: "",
    selectedTags: [] as string[],
  });

  const [createTagSearch, setCreateTagSearch] = useState("");

  const predefinedSet = new Set<string>(PREDEFINED_TAGS);
  const allAvailableTags: string[] = [...PREDEFINED_TAGS, ...customTags.filter(t => !predefinedSet.has(t))];
  const filteredCreateTags = createTagSearch
    ? allAvailableTags.filter(t => t.toLowerCase().includes(createTagSearch.toLowerCase()))
    : allAvailableTags;

  const filteredEntities = useMemo(() => {
    let result = entities;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e => e.displayName.toLowerCase().includes(q) || e.description?.toLowerCase().includes(q));
    }
    if (filterType) {
      result = result.filter(e => {
        const entityTags = (e.tags as string[]) || [];
        return entityTags.includes(filterType);
      });
    }
    return result.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [entities, searchQuery, filterType]);

  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    entities.forEach(e => {
      const entityTags = (e.tags as string[]) || [];
      entityTags.forEach(tag => { counts[tag] = (counts[tag] || 0) + 1; });
    });
    return counts;
  }, [entities]);

  const handleCreate = async () => {
    if (!newEntity.displayName.trim()) return;
    const name = newEntity.displayName.trim();
    const created = await createEntity.mutateAsync({
      worldId: worldId || undefined,
      campaignId: campaignId || undefined,
      displayName: name,
      entityType: newEntity.entityType,
      description: newEntity.description.trim() || undefined,
      visibility: newEntity.visibility,
      sheetId: newEntity.sheetId || undefined,
      tags: newEntity.selectedTags,
    });
    setShowCreateDialog(false);
    setNewEntity({ displayName: "", entityType: "article", description: "", visibility: "shared", sheetId: "", selectedTags: [] });
    setCreateTagSearch("");
    if (created?.id && onEntityCreated) {
      onEntityCreated(created.id, name);
    }
    if (createOnly && onCloseCreate) onCloseCreate();
  };

  const handleEntityClick = (entityId: string, e?: React.MouseEvent) => {
    const entity = entities.find(ent => ent.id === entityId);
    const title = entity?.displayName || "Article";
    const wantsNewTab = e && (e.ctrlKey || e.metaKey);
    if (wantsNewTab && onOpenEntityNewTab) {
      onOpenEntityNewTab(entityId, title);
    } else if (onOpenEntity) {
      onOpenEntity(entityId, title);
    } else if (onOpenEntityNewTab) {
      onOpenEntityNewTab(entityId, title);
    } else {
      setSelectedEntityId(entityId);
    }
  };

  const toggleCreateTag = (tag: string) => {
    setNewEntity(prev => ({
      ...prev,
      selectedTags: prev.selectedTags.includes(tag)
        ? prev.selectedTags.filter(t => t !== tag)
        : [...prev.selectedTags, tag]
    }));
  };

  const createDialog = (
    <Dialog open={showCreateDialog} onOpenChange={(open) => { setShowCreateDialog(open); if (!open && onCloseCreate) onCloseCreate(); }}>
      <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 w-full max-w-[95vw] md:max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-create-entity">
        <DialogHeader>
          <DialogTitle className="text-stone-100">Create New Article</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_minmax(0,260px)] gap-4">
          <div className="space-y-3 min-w-0">
            <div>
              <Label className="text-xs text-stone-400">Article Type</Label>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => setNewEntity(p => ({ ...p, entityType: "article" }))}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                    newEntity.entityType === "article"
                      ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                      : "border-stone-700 bg-stone-800 text-stone-400 hover:border-stone-600"
                  }`}
                  data-testid="button-type-article"
                >
                  <FileText className="h-4 w-4" />
                  Article
                </button>
                <button
                  onClick={() => setNewEntity(p => ({ ...p, entityType: "canvas" }))}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                    newEntity.entityType === "canvas"
                      ? "border-blue-500/50 bg-blue-500/10 text-blue-300"
                      : "border-stone-700 bg-stone-800 text-stone-400 hover:border-stone-600"
                  }`}
                  data-testid="button-type-canvas"
                >
                  <Layout className="h-4 w-4" />
                  Canvas
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs text-stone-400">Name</Label>
              <Input
                value={newEntity.displayName}
                onChange={(e) => setNewEntity(p => ({ ...p, displayName: e.target.value }))}
                placeholder="Article name..."
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
          </div>
          <div className="flex flex-col min-w-0 md:border-l md:border-stone-700 md:pl-4">
            <Label className="text-xs text-stone-400 flex items-center gap-1 mb-1">
              <Tag className="h-3 w-3" /> Tags
              {newEntity.selectedTags.length > 0 && (
                <span className="ml-auto text-[10px] text-stone-500" data-testid="text-create-tag-count">
                  {newEntity.selectedTags.length} selected
                </span>
              )}
            </Label>
            {newEntity.selectedTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1.5 max-h-24 overflow-y-auto pr-1">
                {newEntity.selectedTags.map(tag => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 cursor-pointer"
                    style={{ borderColor: (TAG_COLORS[tag] || "#78909c") + "55", color: TAG_COLORS[tag] || "#78909c", backgroundColor: (TAG_COLORS[tag] || "#78909c") + "15" }}
                    onClick={() => toggleCreateTag(tag)}
                    data-testid={`create-tag-selected-${tag}`}
                  >
                    {tag} <X className="h-2.5 w-2.5 ml-1" />
                  </Badge>
                ))}
              </div>
            )}
            <Input
              value={createTagSearch}
              onChange={(e) => setCreateTagSearch(e.target.value)}
              placeholder="Search tags..."
              className="bg-stone-800 border-stone-700 text-stone-200 text-xs h-7 mb-1"
              data-testid="input-create-tag-search"
            />
            <div className="flex-1 min-h-[180px] md:min-h-[260px] md:max-h-[420px] max-h-48 overflow-y-auto border border-stone-700 rounded bg-stone-800/50">
              {filteredCreateTags.length === 0 ? (
                <div className="text-[11px] text-stone-500 px-2 py-2 italic">No tags match your search.</div>
              ) : (
                filteredCreateTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleCreateTag(tag)}
                    className={`w-full text-left px-2 py-1 text-xs transition-colors flex items-center justify-between ${
                      newEntity.selectedTags.includes(tag) ? 'bg-stone-700/50 text-amber-400' : 'text-stone-300 hover:bg-stone-700/30'
                    }`}
                    data-testid={`create-tag-option-${tag}`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: TAG_COLORS[tag] || "#78909c" }} />
                      {tag}
                    </span>
                    {newEntity.selectedTags.includes(tag) && <span className="text-[10px]">&#10003;</span>}
                  </button>
                ))
              )}
            </div>
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

  if (createOnly) {
    return createDialog;
  }

  const gridContent = (
    <div className="flex flex-col h-full" data-testid="worldbuilder-panel-grid">
      <div className="p-3 space-y-2 border-b border-stone-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-stone-200">Encyclopedia</h2>
            <span className="text-[10px] text-stone-500">{entities.length} article{entities.length !== 1 ? 's' : ''}</span>
          </div>
          {isGM && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCreateDialog(true)}
              className="text-xs text-amber-400 hover:text-amber-300 h-7"
              data-testid="button-grid-create-entity"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> New
            </Button>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-500" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search articles..."
            className="pl-8 h-8 text-xs bg-stone-800 border-stone-700 text-stone-200"
            data-testid="input-grid-search"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300" data-testid="button-grid-clear-search">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge
            variant={filterType === "" ? "default" : "outline"}
            className={`text-[9px] cursor-pointer px-1.5 py-0 ${filterType === "" ? "bg-amber-500/20 text-amber-400 border-amber-500/50" : "border-stone-700 text-stone-500 hover:text-stone-300"}`}
            onClick={() => setFilterType("")}
            data-testid="grid-panel-filter-all"
          >
            All ({entities.length})
          </Badge>
          {Object.entries(tagCounts).sort(([, a], [, b]) => b - a).map(([tag, count]) => (
            <Badge
              key={tag}
              variant={filterType === tag ? "default" : "outline"}
              className={`text-[9px] cursor-pointer px-1.5 py-0 ${filterType === tag ? "text-white" : "border-stone-700 text-stone-500 hover:text-stone-300"}`}
              style={filterType === tag ? { backgroundColor: (TAG_COLORS[tag] || "#78909c") + "33", color: TAG_COLORS[tag] || "#78909c", borderColor: (TAG_COLORS[tag] || "#78909c") + "55" } : {}}
              onClick={() => setFilterType(filterType === tag ? "" : tag)}
              data-testid={`grid-panel-filter-${tag}`}
            >
              {tag} ({count})
            </Badge>
          ))}
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3">
          {isLoading ? (
            <div className="flex justify-center py-12"><div className="text-stone-600 text-xs">Loading...</div></div>
          ) : filteredEntities.length === 0 ? (
            <div className="text-center py-10">
              <BookOpen className="h-8 w-8 text-stone-700 mx-auto mb-2" />
              <p className="text-stone-500 text-xs">{searchQuery || filterType ? "No matching articles" : "No articles yet."}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filteredEntities.map(entity => {
                const cfg = ENTITY_TYPE_CONFIG[entity.entityType];
                const IconComp = cfg ? ICON_MAP[cfg.icon] || FileText : FileText;
                const entityTags = (entity.tags as string[]) || [];
                return (
                  <button
                    key={entity.id}
                    onClick={(e) => handleEntityClick(entity.id, e)}
                    onContextMenu={onEntityContextMenu ? (e) => onEntityContextMenu(e, entity.id, entity.displayName) : undefined}
                    className="text-left p-2.5 rounded-lg bg-stone-800/40 border border-stone-800/60 hover:border-amber-500/30 hover:bg-stone-800/60 transition-all group"
                    data-testid={`grid-entity-${entity.id}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: (cfg?.color || "#78909c") + "15" }}>
                        <IconComp className="h-3.5 w-3.5" style={{ color: cfg?.color || "#78909c" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-stone-200 group-hover:text-amber-300 truncate transition-colors">
                          {entity.displayName}
                        </div>
                        {entity.description && (
                          <div className="text-[10px] text-stone-500 line-clamp-2 mt-0.5">{entity.description}</div>
                        )}
                        {entityTags.length > 0 && (
                          <div className="flex flex-wrap gap-0.5 mt-1">
                            {entityTags.slice(0, 3).map(tag => (
                              <span key={tag} className="text-[8px] px-1 rounded-full" style={{ color: TAG_COLORS[tag] || "#78909c", backgroundColor: (TAG_COLORS[tag] || "#78909c") + "15" }}>
                                {tag}
                              </span>
                            ))}
                            {entityTags.length > 3 && <span className="text-[7px] text-stone-500">+{entityTags.length - 3}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );

  const listContent = (
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
            className={`h-8 w-8 ${showFilters ? 'text-amber-400' : 'text-stone-500 hover:text-stone-300'}`}
            data-testid="button-toggle-filters"
          >
            <Filter className="h-3.5 w-3.5" />
          </Button>
        </div>
        {showFilters && (
          <div className="flex flex-wrap gap-1">
            <Badge
              variant={filterType === "" ? "default" : "outline"}
              className={`text-[9px] cursor-pointer px-1.5 py-0 ${filterType === "" ? "bg-amber-500/20 text-amber-400 border-amber-500/50" : "border-stone-700 text-stone-500 hover:text-stone-300"}`}
              onClick={() => setFilterType("")}
            >
              All ({entities.length})
            </Badge>
            {Object.entries(tagCounts).sort(([, a], [, b]) => b - a).map(([tag, count]) => (
              <Badge
                key={tag}
                variant={filterType === tag ? "default" : "outline"}
                className={`text-[9px] cursor-pointer px-1.5 py-0 ${filterType === tag ? "text-white" : "border-stone-700 text-stone-500 hover:text-stone-300"}`}
                style={filterType === tag ? { backgroundColor: (TAG_COLORS[tag] || "#78909c") + "33", color: TAG_COLORS[tag] || "#78909c", borderColor: (TAG_COLORS[tag] || "#78909c") + "55" } : {}}
                onClick={() => setFilterType(filterType === tag ? "" : tag)}
              >
                {tag} ({count})
              </Badge>
            ))}
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {isLoading ? (
            <div className="text-center py-8 text-stone-600 text-xs">Loading...</div>
          ) : filteredEntities.length === 0 ? (
            <div className="text-center py-6 text-stone-600 text-xs">
              {searchQuery || filterType ? "No matching articles" : "No articles yet."}
            </div>
          ) : (
            filteredEntities.map(entity => {
              const cfg = ENTITY_TYPE_CONFIG[entity.entityType];
              const IconComp = cfg ? ICON_MAP[cfg.icon] || FileText : FileText;
              return (
                <div
                  key={entity.id}
                  role="listitem"
                  tabIndex={0}
                  onClick={(e) => handleEntityClick(entity.id, e)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleEntityClick(entity.id); } }}
                  className={`w-full text-left px-2 py-1.5 rounded-md transition-colors group flex items-center gap-2 cursor-pointer ${
                    selectedEntityId === entity.id
                      ? 'bg-stone-800 border-l-2 border-amber-400'
                      : 'hover:bg-stone-800/60'
                  }`}
                  onContextMenu={onEntityContextMenu ? (e) => onEntityContextMenu(e, entity.id, entity.displayName) : undefined}
                  data-testid={`entity-list-item-${entity.id}`}
                >
                  <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: (cfg?.color || "#78909c") + "18" }}>
                    <IconComp className="h-2.5 w-2.5" style={{ color: cfg?.color || "#78909c" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-[11px] font-medium truncate ${selectedEntityId === entity.id ? 'text-amber-400' : 'text-stone-300 group-hover:text-stone-100'}`}>
                      {entity.displayName}
                    </div>
                    {entity.description && (
                      <div className="text-[9px] text-stone-500 truncate">{entity.description}</div>
                    )}
                    {((entity.tags as string[]) || []).length > 0 && (
                      <div className="flex flex-wrap gap-0.5 mt-0.5">
                        {((entity.tags as string[]) || []).slice(0, 3).map(tag => (
                          <span key={tag} className="text-[8px] px-1 rounded" style={{ color: TAG_COLORS[tag] || "#78909c", backgroundColor: (TAG_COLORS[tag] || "#78909c") + "15" }}>
                            {tag}
                          </span>
                        ))}
                        {((entity.tags as string[]) || []).length > 3 && (
                          <span className="text-[8px] text-stone-500">+{((entity.tags as string[]) || []).length - 3}</span>
                        )}
                      </div>
                    )}
                  </div>
                  {onOpenEntityNewTab && (
                    <button
                      type="button"
                      title="Open in new tab"
                      className="hidden group-hover:flex items-center justify-center w-5 h-5 rounded hover:bg-stone-700 text-stone-500 hover:text-amber-400 flex-shrink-0"
                      onClick={(e) => { e.stopPropagation(); const t = entity.displayName || "Article"; onOpenEntityNewTab(entity.id, t); }}
                      data-testid={`open-new-tab-${entity.id}`}
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );

  return (
    <>
      {gridView ? gridContent : listContent}

      {selectedEntityId && (
        <Dialog open={!!selectedEntityId} onOpenChange={() => setSelectedEntityId(null)}>
          <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 w-full max-w-3xl max-h-[80vh] overflow-hidden p-0">
            <EntitySidePanel
              worldId={worldId}
              campaignId={campaignId}
              entityId={selectedEntityId}
              onClose={() => setSelectedEntityId(null)}
              onNavigateToEntity={(id) => setSelectedEntityId(id)}
              isGM={isGM}
            />
          </DialogContent>
        </Dialog>
      )}

      {createDialog}
    </>
  );
}
