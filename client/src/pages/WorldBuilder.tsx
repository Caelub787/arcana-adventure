import React, { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { WorldbuilderPanel } from "@/components/worldbuilding/WorldbuilderPanel";
import { WikiArticleEditor } from "@/components/worldbuilding/WikiArticleEditor";
import { TimelineView } from "@/components/worldbuilding/TimelineView";
import { RelationshipGraph } from "@/components/worldbuilding/RelationshipGraph";
import { EntitySidePanel } from "@/components/worldbuilding/EntitySidePanel";
import { useEntities, useEntityLinks, useEntity, useWorldbuildingSync, ENTITY_TYPE_CONFIG, type Entity } from "@/lib/worldbuilding-api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Globe, Loader2, Network, Clock, FileText, ChevronLeft, BookOpen, Search, Plus, User, MapPin, Shield, Scroll, Calendar, Package, Swords, Sparkles } from "lucide-react";
import ProfileDropdown from "@/components/ProfileDropdown";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

const ICON_MAP: Record<string, React.ElementType> = {
  User, MapPin, Shield, Scroll, Calendar, BookOpen, Package, Swords, Search, Sparkles, Clock, FileText,
};

export default function WorldBuilder() {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"article" | "timeline" | "graph">("article");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("");
  const [showCreateInline, setShowCreateInline] = useState(false);
  const [entityHistory, setEntityHistory] = useState<string[]>([]);

  const { data: campaignsData, isLoading: campaignsLoading } = useQuery<{ created: any[], joined: any[] }>({
    queryKey: ['/api/campaigns'],
    enabled: !!user,
  });

  const gmCampaigns = [
    ...(campaignsData?.created || []),
    ...(campaignsData?.joined || []).filter((c: any) => c.role === 'gm' || c.role === 'assistant_gm'),
  ];
  const uniqueGmCampaigns = gmCampaigns.filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i);

  useEffect(() => {
    if (uniqueGmCampaigns.length > 0 && !selectedCampaignId) {
      setSelectedCampaignId(uniqueGmCampaigns[0].id);
    }
  }, [uniqueGmCampaigns, selectedCampaignId]);

  useWorldbuildingSync(selectedCampaignId);
  const { data: entities = [], isLoading: entitiesLoading } = useEntities(selectedCampaignId || undefined);
  const { data: links = [] } = useEntityLinks(selectedCampaignId || undefined);
  const { data: selectedEntity } = useEntity(
    selectedCampaignId || undefined,
    selectedEntityId || undefined
  );

  const { data: characters = [] } = useQuery<any[]>({
    queryKey: ['/api/campaigns', selectedCampaignId, 'characters'],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${selectedCampaignId}/characters`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedCampaignId,
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

  const recentEntities = useMemo(() => {
    return [...entities].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 8);
  }, [entities]);

  const backlinkEntities = useMemo(() => {
    if (!selectedEntityId) return [];
    return links
      .filter(l => l.toEntityId === selectedEntityId)
      .map(l => entities.find(e => e.id === l.fromEntityId))
      .filter(Boolean) as Entity[];
  }, [selectedEntityId, links, entities]);

  const handleSelectEntity = (entityId: string) => {
    if (selectedEntityId) {
      setEntityHistory(prev => [...prev.slice(-20), selectedEntityId]);
    }
    setSelectedEntityId(entityId);
    setActiveView("article");
  };

  const handleBack = () => {
    if (entityHistory.length > 0) {
      const prev = entityHistory[entityHistory.length - 1];
      setEntityHistory(h => h.slice(0, -1));
      setSelectedEntityId(prev);
    } else {
      setSelectedEntityId(null);
    }
  };

  const handleLogout = async () => {
    await logout();
    setLocation("/login");
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100" data-testid="worldbuilder-page">
      <header className="border-b border-stone-800 bg-stone-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" className="text-stone-400 hover:text-stone-200 h-8 w-8" data-testid="button-back-home">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-amber-400" />
              <h1 className="text-base font-semibold text-stone-200">World Builder</h1>
            </div>
            {selectedCampaignId && (
              <div className="flex items-center gap-1 ml-2">
                <Tabs value={activeView} onValueChange={(v) => setActiveView(v as any)}>
                  <TabsList className="bg-stone-800/50 h-8">
                    <TabsTrigger value="article" className="text-xs h-6 data-[state=active]:bg-stone-700 data-[state=active]:text-amber-400">
                      <FileText className="h-3 w-3 mr-1" /> Wiki
                    </TabsTrigger>
                    <TabsTrigger value="timeline" className="text-xs h-6 data-[state=active]:bg-stone-700 data-[state=active]:text-amber-400">
                      <Clock className="h-3 w-3 mr-1" /> Timeline
                    </TabsTrigger>
                    <TabsTrigger value="graph" className="text-xs h-6 data-[state=active]:bg-stone-700 data-[state=active]:text-amber-400">
                      <Network className="h-3 w-3 mr-1" /> Graph
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {uniqueGmCampaigns.length > 0 && (
              <Select value={selectedCampaignId} onValueChange={(val) => { setSelectedCampaignId(val); setSelectedEntityId(null); }}>
                <SelectTrigger className="w-[200px] bg-stone-800 border-stone-700 text-stone-200 h-8 text-xs" data-testid="select-campaign">
                  <SelectValue placeholder="Select Campaign" />
                </SelectTrigger>
                <SelectContent className="bg-stone-800 border-stone-700">
                  {uniqueGmCampaigns.map((c: any) => (
                    <SelectItem key={c.id} value={c.id} className="text-stone-200 focus:bg-stone-700 focus:text-stone-100 text-xs">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <ProfileDropdown onLogout={handleLogout} />
          </div>
        </div>
      </header>

      {campaignsLoading ? (
        <div className="flex items-center justify-center h-[calc(100vh-49px)]">
          <Loader2 className="h-8 w-8 animate-spin text-stone-500" />
        </div>
      ) : uniqueGmCampaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[calc(100vh-49px)] p-6 text-center">
          <Globe className="h-16 w-16 text-stone-700 mb-4" />
          <h2 className="text-lg font-semibold text-stone-500 mb-2">No Campaigns Found</h2>
          <p className="text-stone-600 text-sm max-w-md mb-4">You need to be a GM of at least one campaign to use the World Builder.</p>
          <Link href="/my-campaigns">
            <Button className="bg-amber-600 hover:bg-amber-500 text-white" data-testid="button-go-campaigns">Go to My Campaigns</Button>
          </Link>
        </div>
      ) : (
        <div className="flex h-[calc(100vh-49px)]">
          {/* Left Sidebar - Wiki Navigation */}
          <div className={`${sidebarCollapsed ? 'w-12' : 'w-72'} border-r border-stone-800 bg-stone-900/50 flex-shrink-0 flex flex-col transition-all duration-200`}>
            {sidebarCollapsed ? (
              <div className="flex flex-col items-center py-3 gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-stone-400 hover:text-stone-200" onClick={() => setSidebarCollapsed(false)} data-testid="button-expand-sidebar">
                  <BookOpen className="h-4 w-4" />
                </Button>
                {Object.entries(ENTITY_TYPE_CONFIG).map(([key, cfg]) => {
                  const count = typeCounts[key] || 0;
                  if (count === 0) return null;
                  const IconComp = ICON_MAP[cfg.icon] || Search;
                  return (
                    <Button
                      key={key}
                      variant="ghost"
                      size="icon"
                      className={`h-7 w-7 ${filterType === key ? 'text-amber-400' : 'text-stone-500 hover:text-stone-300'}`}
                      onClick={() => { setFilterType(filterType === key ? "" : key); setSidebarCollapsed(false); }}
                      title={`${cfg.label} (${count})`}
                    >
                      <IconComp className="h-3.5 w-3.5" />
                    </Button>
                  );
                })}
              </div>
            ) : (
              <>
                <div className="p-3 border-b border-stone-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Encyclopedia</h2>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-amber-400 hover:text-amber-300" onClick={() => setShowCreateInline(!showCreateInline)} data-testid="button-new-entity">
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-stone-500 hover:text-stone-300" onClick={() => setSidebarCollapsed(true)} data-testid="button-collapse-sidebar">
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-stone-500" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search articles..."
                      className="pl-7 h-7 text-xs bg-stone-800 border-stone-700 text-stone-200"
                      data-testid="input-wiki-search"
                    />
                  </div>
                </div>

                {/* Category Filters */}
                <div className="px-3 py-2 border-b border-stone-800 flex flex-wrap gap-1">
                  <Badge
                    variant={filterType === "" ? "default" : "outline"}
                    className={`text-[9px] cursor-pointer px-1.5 py-0 ${filterType === "" ? "bg-amber-500/20 text-amber-400 border-amber-500/50" : "border-stone-700 text-stone-500 hover:text-stone-300"}`}
                    onClick={() => setFilterType("")}
                  >
                    All ({entities.length})
                  </Badge>
                  {Object.entries(ENTITY_TYPE_CONFIG).map(([key, cfg]) => {
                    const count = typeCounts[key] || 0;
                    if (count === 0) return null;
                    return (
                      <Badge
                        key={key}
                        variant={filterType === key ? "default" : "outline"}
                        className={`text-[9px] cursor-pointer px-1.5 py-0 ${filterType === key ? "text-white" : "border-stone-700 text-stone-500 hover:text-stone-300"}`}
                        style={filterType === key ? { backgroundColor: cfg.color + "33", color: cfg.color, borderColor: cfg.color + "55" } : {}}
                        onClick={() => setFilterType(filterType === key ? "" : key)}
                      >
                        {cfg.label} ({count})
                      </Badge>
                    );
                  })}
                </div>

                <ScrollArea className="flex-1">
                  {/* Recently Edited section */}
                  {!searchQuery && !filterType && recentEntities.length > 0 && (
                    <div className="px-3 py-2 border-b border-stone-800">
                      <h3 className="text-[10px] font-medium text-stone-500 uppercase tracking-wider mb-1.5">Recently Edited</h3>
                      {recentEntities.slice(0, 5).map(e => {
                        const cfg = ENTITY_TYPE_CONFIG[e.entityType];
                        const IconComp = cfg ? ICON_MAP[cfg.icon] || Search : Search;
                        return (
                          <button
                            key={e.id}
                            onClick={() => handleSelectEntity(e.id)}
                            className={`w-full text-left px-2 py-1 rounded text-xs flex items-center gap-2 transition-colors ${selectedEntityId === e.id ? 'bg-stone-800 text-amber-400' : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/50'}`}
                            data-testid={`recent-entity-${e.id}`}
                          >
                            <IconComp className="h-3 w-3 flex-shrink-0" style={{ color: cfg?.color }} />
                            <span className="truncate">{e.displayName}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Backlinks section */}
                  {selectedEntityId && backlinkEntities.length > 0 && (
                    <div className="px-3 py-2 border-b border-stone-800">
                      <h3 className="text-[10px] font-medium text-stone-500 uppercase tracking-wider mb-1.5">What Links Here</h3>
                      {backlinkEntities.map(e => {
                        const cfg = ENTITY_TYPE_CONFIG[e.entityType];
                        const IconComp = cfg ? ICON_MAP[cfg.icon] || Search : Search;
                        return (
                          <button
                            key={e.id}
                            onClick={() => handleSelectEntity(e.id)}
                            className="w-full text-left px-2 py-1 rounded text-xs flex items-center gap-2 text-stone-400 hover:text-stone-200 hover:bg-stone-800/50"
                            data-testid={`backlink-entity-${e.id}`}
                          >
                            <IconComp className="h-3 w-3 flex-shrink-0" style={{ color: cfg?.color }} />
                            <span className="truncate">{e.displayName}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Entity List */}
                  <div className="px-2 py-1.5">
                    {entitiesLoading ? (
                      <div className="space-y-2 p-2">
                        {[1,2,3].map(i => <div key={i} className="h-10 bg-stone-800 rounded animate-pulse" />)}
                      </div>
                    ) : filteredEntities.length === 0 ? (
                      <div className="text-center py-6 text-stone-500">
                        <Globe className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        <p className="text-[11px]">{searchQuery ? "No matching articles" : "No entities yet"}</p>
                      </div>
                    ) : (
                      filteredEntities.map(entity => {
                        const cfg = ENTITY_TYPE_CONFIG[entity.entityType];
                        const IconComp = cfg ? ICON_MAP[cfg.icon] || Search : Search;
                        return (
                          <button
                            key={entity.id}
                            onClick={() => handleSelectEntity(entity.id)}
                            className={`w-full text-left px-2.5 py-2 rounded-md transition-colors group flex items-center gap-2.5 mb-0.5 ${
                              selectedEntityId === entity.id
                                ? 'bg-stone-800 border-l-2 border-amber-400'
                                : 'hover:bg-stone-800/60'
                            }`}
                            data-testid={`entity-list-item-${entity.id}`}
                          >
                            <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: cfg?.color + "18" }}>
                              <IconComp className="h-3 w-3" style={{ color: cfg?.color }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className={`text-xs font-medium truncate ${selectedEntityId === entity.id ? 'text-amber-400' : 'text-stone-300 group-hover:text-stone-100'}`}>
                                {entity.displayName}
                              </div>
                              {entity.description && (
                                <div className="text-[10px] text-stone-500 truncate">{entity.description}</div>
                              )}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </>
            )}
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {activeView === "article" && (
              <>
                {selectedEntityId && selectedEntity ? (
                  <div className="flex-1 flex overflow-hidden">
                    {/* Article Editor - center */}
                    <div className="flex-1 overflow-hidden flex flex-col">
                      <div className="flex items-center gap-2 px-4 py-2 border-b border-stone-800 bg-stone-900/30">
                        {entityHistory.length > 0 && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-400 hover:text-stone-200" onClick={handleBack} data-testid="button-back-entity">
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                        )}
                        <div className="flex items-center gap-2">
                          {(() => {
                            const cfg = ENTITY_TYPE_CONFIG[selectedEntity.entityType];
                            const IconComp = cfg ? ICON_MAP[cfg.icon] || Search : Search;
                            return (
                              <>
                                <IconComp className="h-4 w-4" style={{ color: cfg?.color }} />
                                <Badge variant="outline" className="text-[10px] border-stone-600 text-stone-400">{cfg?.label}</Badge>
                              </>
                            );
                          })()}
                          <span className="text-[10px] text-stone-600">
                            {selectedEntity.visibility === "gm_only" ? "GM Only" : selectedEntity.visibility === "player_visible" ? "Players" : "Shared"}
                          </span>
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto">
                        <WikiArticleEditor
                          entity={selectedEntity}
                          campaignId={selectedCampaignId}
                          isGM={true}
                        />
                      </div>
                    </div>

                    {/* Right Panel - Relationships & Details */}
                    <div className="w-72 border-l border-stone-800 bg-stone-900/30 flex-shrink-0 overflow-y-auto">
                      <EntitySidePanel
                        campaignId={selectedCampaignId}
                        entityId={selectedEntityId}
                        onClose={() => setSelectedEntityId(null)}
                        onNavigateToEntity={handleSelectEntity}
                        isGM={true}
                        embedded={true}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center p-8 max-w-lg">
                      <Globe className="h-16 w-16 text-stone-800 mx-auto mb-4" />
                      <h2 className="text-xl font-semibold text-stone-600 mb-2">Your World Awaits</h2>
                      <p className="text-stone-600 text-sm mb-6">Select an article from the sidebar or create a new one to start building your world's encyclopedia.</p>
                      <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
                        {Object.entries(ENTITY_TYPE_CONFIG).slice(0, 6).map(([key, cfg]) => {
                          const IconComp = ICON_MAP[cfg.icon] || Search;
                          return (
                            <div key={key} className="flex flex-col items-center gap-1 p-3 rounded-lg bg-stone-900/50 border border-stone-800">
                              <IconComp className="h-5 w-5" style={{ color: cfg.color }} />
                              <span className="text-[10px] text-stone-500">{cfg.label}</span>
                              <span className="text-[10px] text-stone-600">{typeCounts[key] || 0}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {activeView === "timeline" && (
              <div className="flex-1 overflow-y-auto">
                <TimelineView
                  entities={entities}
                  onSelectEntity={handleSelectEntity}
                />
              </div>
            )}

            {activeView === "graph" && (
              <div className="flex-1">
                <RelationshipGraph
                  entities={entities}
                  links={links}
                  onSelectEntity={handleSelectEntity}
                  selectedEntityId={selectedEntityId}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {showCreateInline && selectedCampaignId && (
        <WorldbuilderPanel
          campaignId={selectedCampaignId}
          isGM={true}
          characters={characters}
          onOpenEntity={handleSelectEntity}
          createOnly={true}
          onCloseCreate={() => setShowCreateInline(false)}
        />
      )}
    </div>
  );
}
