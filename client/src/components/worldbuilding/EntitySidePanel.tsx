import React, { useState } from "react";
import { useEntity, useEntityLinks, useEntityReferences, useEntities, useCreateEntityLink, useDeleteEntityLink, ENTITY_TYPE_CONFIG, LINK_TYPE_LABELS, type Entity, type EntityLink } from "@/lib/worldbuilding-api";
import { SheetEmbed } from "./SheetEmbed";
import { InventoryEmbed } from "./InventoryEmbed";
import { EntityPreviewPanel, EntityLinkCard } from "./EntityPreviewPanel";
import { EntityPicker } from "./EntityPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { X, User, MapPin, Shield, Scroll, Calendar, BookOpen, Package, Swords, Search, Link2, Plus, Eye, EyeOff, Tag } from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  User, MapPin, Shield, Scroll, Calendar, BookOpen, Package, Swords, Search,
};

interface EntitySidePanelProps {
  campaignId?: string;
  worldId?: string;
  entityId: string;
  onClose?: () => void;
  onNavigateToEntity?: (entityId: string) => void;
  isGM?: boolean;
  embedded?: boolean;
}

export function EntitySidePanel({ campaignId, worldId, entityId, onClose, onNavigateToEntity, isGM = false, embedded = false }: EntitySidePanelProps) {
  const resolvedId = worldId || campaignId;
  const { data: entity, isLoading } = useEntity(resolvedId, entityId);
  const { data: links = [] } = useEntityLinks(resolvedId, entityId);
  const { data: references } = useEntityReferences(resolvedId, entityId);
  const { data: allEntities = [] } = useEntities(resolvedId);
  const createLink = useCreateEntityLink(resolvedId);
  const deleteLink = useDeleteEntityLink(resolvedId);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [linkType, setLinkType] = useState("related_to");

  const containerClass = embedded
    ? "h-full flex flex-col"
    : "fixed right-0 top-0 h-full w-96 bg-stone-900 border-l border-stone-700 z-[10500] shadow-2xl flex flex-col";

  if (isLoading || !entity) {
    return (
      <div className={embedded ? "p-4" : "fixed right-0 top-0 h-full w-96 bg-stone-900 border-l border-stone-700 z-[10500] shadow-2xl p-4"} data-testid="entity-side-panel-loading">
        {!embedded && <div className="flex justify-end"><Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button></div>}
        <div className="animate-pulse space-y-3 mt-4">
          <div className="h-6 bg-stone-800 rounded w-3/4" />
          <div className="h-4 bg-stone-800 rounded w-1/2" />
          <div className="h-20 bg-stone-800 rounded" />
        </div>
      </div>
    );
  }

  const cfg = ENTITY_TYPE_CONFIG[entity.entityType];
  const IconComp = cfg ? ICON_MAP[cfg.icon] || Search : Search;
  const entityMap = new Map(allEntities.map(e => [e.id, e]));

  const hasSheet = !!entity.sheetId;
  const hasNotes = !!entity.notePageId;

  const handleAddLink = (targetEntity: Entity) => {
    createLink.mutate({
      campaignId: resolvedId,
      fromEntityId: entity.id,
      toEntityId: targetEntity.id,
      linkType,
    } as any);
    setShowLinkPicker(false);
  };

  const loreFields = entity.loreFields as Record<string, any> | null;

  return (
    <div className={containerClass} data-testid="entity-side-panel">
      {!embedded && (
        <div className="flex items-center gap-2 p-3 border-b border-stone-700 bg-stone-800/50">
          <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: cfg?.color + "22" }}>
            <IconComp className="h-4 w-4" style={{ color: cfg?.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-stone-200 truncate text-sm">{entity.displayName}</h3>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] px-1.5 border-stone-600 text-stone-400">{cfg?.label}</Badge>
              <span className="text-[10px] text-stone-500 flex items-center gap-1">
                {entity.visibility === "gm_only" ? <><EyeOff className="h-2.5 w-2.5" /> GM Only</> : entity.visibility === "player_visible" ? <><Eye className="h-2.5 w-2.5" /> Players</> : "Shared"}
              </span>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-stone-400 hover:text-stone-200 flex-shrink-0" data-testid="button-close-entity-panel">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="bg-stone-800/50 border-b border-stone-700 rounded-none justify-start px-2 h-9 flex-shrink-0">
          <TabsTrigger value="overview" className="text-xs data-[state=active]:bg-stone-700 data-[state=active]:text-amber-400">Overview</TabsTrigger>
          {hasNotes && <TabsTrigger value="notes" className="text-xs data-[state=active]:bg-stone-700 data-[state=active]:text-amber-400">Notes</TabsTrigger>}
          {hasSheet && <TabsTrigger value="sheet" className="text-xs data-[state=active]:bg-stone-700 data-[state=active]:text-amber-400">Sheet</TabsTrigger>}
          {hasSheet && <TabsTrigger value="inventory" className="text-xs data-[state=active]:bg-stone-700 data-[state=active]:text-amber-400">Inventory</TabsTrigger>}
          <TabsTrigger value="relationships" className="text-xs data-[state=active]:bg-stone-700 data-[state=active]:text-amber-400">Links</TabsTrigger>
          <TabsTrigger value="references" className="text-xs data-[state=active]:bg-stone-700 data-[state=active]:text-amber-400">Refs</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto">
          <TabsContent value="overview" className="p-3 space-y-3 mt-0">
            {entity.image && (
              <img src={entity.image} alt="" className="w-full h-32 object-cover rounded-lg border border-stone-700" />
            )}
            {entity.description && (
              <p className="text-sm text-stone-300 leading-relaxed">{entity.description}</p>
            )}
            {entity.tags && entity.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {entity.tags.map(tag => (
                  <Badge key={tag} variant="outline" className="text-[10px] px-1.5 border-stone-700 text-stone-400">
                    <Tag className="h-2.5 w-2.5 mr-1" />{tag}
                  </Badge>
                ))}
              </div>
            )}
            {loreFields && Object.keys(loreFields).length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-stone-400 uppercase tracking-wider">Lore</h4>
                {Object.entries(loreFields).map(([key, value]) => value ? (
                  <div key={key} className="bg-stone-800/50 rounded p-2">
                    <div className="text-[10px] text-stone-500 uppercase mb-1">{key.replace(/([A-Z])/g, ' $1').trim()}</div>
                    <div className="text-xs text-stone-300">{String(value)}</div>
                  </div>
                ) : null)}
              </div>
            )}

            {entity.entityType === "quest" && entity.questData && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-stone-400 uppercase tracking-wider">Quest Info</h4>
                <div className="bg-stone-800/50 rounded p-2 space-y-1">
                  {(entity.questData as any).status && <div className="text-xs"><span className="text-stone-500">Status:</span> <span className="text-stone-300">{(entity.questData as any).status}</span></div>}
                  {(entity.questData as any).questType && <div className="text-xs"><span className="text-stone-500">Type:</span> <span className="text-stone-300">{(entity.questData as any).questType}</span></div>}
                  {(entity.questData as any).objectives && (
                    <div className="text-xs mt-1">
                      <span className="text-stone-500">Objectives:</span>
                      <ul className="mt-1 space-y-0.5 pl-3">
                        {((entity.questData as any).objectives as string[]).map((obj: string, i: number) => (
                          <li key={i} className="text-stone-300 list-disc">{obj}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          {hasNotes && (
            <TabsContent value="notes" className="p-3 mt-0">
              <div className="text-xs text-stone-500">Linked note page: {entity.notePageId}</div>
            </TabsContent>
          )}

          {hasSheet && entity.sheetId && (
            <TabsContent value="sheet" className="p-3 mt-0">
              <SheetEmbed characterId={entity.sheetId} campaignId={resolvedId} mode="expanded" />
            </TabsContent>
          )}

          {hasSheet && entity.sheetId && (
            <TabsContent value="inventory" className="p-3 mt-0">
              <InventoryEmbed characterId={entity.sheetId} campaignId={resolvedId} mode="expanded" />
            </TabsContent>
          )}

          <TabsContent value="relationships" className="p-3 space-y-3 mt-0">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-medium text-stone-400 uppercase tracking-wider">Links</h4>
              {isGM && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowLinkPicker(!showLinkPicker)}
                  className="text-xs text-stone-400 hover:text-amber-400 h-6"
                  data-testid="button-add-link"
                >
                  <Plus className="h-3 w-3 mr-1" /> Add Link
                </Button>
              )}
            </div>
            {showLinkPicker && (
              <div className="bg-stone-800/50 rounded-lg p-2 space-y-2 border border-stone-700">
                <select
                  value={linkType}
                  onChange={(e) => setLinkType(e.target.value)}
                  className="w-full bg-stone-900 border border-stone-700 text-stone-300 text-xs rounded px-2 py-1.5"
                >
                  {Object.entries(LINK_TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <EntityPicker
                  worldId={resolvedId}
                  onSelect={handleAddLink}
                  onCancel={() => setShowLinkPicker(false)}
                  excludeIds={[entity.id]}
                  placeholder="Search for entity to link..."
                />
              </div>
            )}
            {links.length === 0 && !showLinkPicker && (
              <div className="text-xs text-stone-500 text-center py-4">No links yet</div>
            )}
            <div className="space-y-1">
              {links.map((link) => (
                <EntityLinkCard
                  key={link.id}
                  link={link}
                  fromEntity={entityMap.get(link.fromEntityId)}
                  toEntity={entityMap.get(link.toEntityId)}
                  onClickEntity={onNavigateToEntity}
                  onRemove={isGM ? () => deleteLink.mutate(link.id) : undefined}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="references" className="p-3 space-y-3 mt-0">
            <h4 className="text-xs font-medium text-stone-400 uppercase tracking-wider">Where This Entity Is Used</h4>
            {references?.noteReferences?.length > 0 ? (
              <div className="space-y-1">
                <div className="text-[10px] text-stone-500 uppercase mb-1">Note References</div>
                {references.noteReferences.map((ref: any) => (
                  <div key={ref.id} className="text-xs text-stone-300 bg-stone-800/50 rounded px-2 py-1.5">
                    Note: {ref.noteId} {ref.label && `(${ref.label})`}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-stone-500 text-center py-4">No references found</div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
