import React, { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { WorldbuilderPanel } from "@/components/worldbuilding/WorldbuilderPanel";
import { WikiArticleEditor } from "@/components/worldbuilding/WikiArticleEditor";
import { TimelineView } from "@/components/worldbuilding/TimelineView";
import { RelationshipGraph } from "@/components/worldbuilding/RelationshipGraph";
import { EntitySidePanel } from "@/components/worldbuilding/EntitySidePanel";
import { WorldCalendar } from "@/components/worldbuilding/WorldCalendar";
import { WorldMapViewer } from "@/components/worldbuilding/WorldMapViewer";
import { WorldMapEditor } from "@/components/worldbuilding/WorldMapEditor";
import { useEntities, useEntityLinks, useEntity, useDeleteEntity, useWorldbuildingSync, ENTITY_TYPE_CONFIG, type Entity, useWorldMaps, useTimelines, useTimelineEvents, type WorldTimeline } from "@/lib/worldbuilding-api";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Globe, Loader2, Network, Clock, FileText, ChevronLeft, BookOpen, Search, Plus, User, MapPin, Shield, Scroll, Calendar, Package, Swords, Sparkles, Menu, X, Info, Map, Share2, ChevronRight, Copy, Check, Trash2, ExternalLink, Settings, Home, Save } from "lucide-react";
import ProfileDropdown from "@/components/ProfileDropdown";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";

const ICON_MAP: Record<string, React.ElementType> = {
  User, MapPin, Shield, Scroll, Calendar, BookOpen, Package, Swords, Search, Sparkles, Clock, FileText,
};

type ActiveSection = "home" | "encyclopedia" | "maps" | "timeline" | "calendar" | "graph";

const SECTION_CONFIG: { key: ActiveSection; label: string; icon: React.ElementType; description: string }[] = [
  { key: "home", label: "Home", icon: Home, description: "World home page" },
  { key: "encyclopedia", label: "Encyclopedia", icon: BookOpen, description: "Wiki articles & entities" },
  { key: "maps", label: "Maps", icon: Map, description: "Interactive world maps" },
  { key: "timeline", label: "Timeline", icon: Clock, description: "Dynamic timeline" },
  { key: "calendar", label: "Calendar", icon: Calendar, description: "Custom calendars" },
  { key: "graph", label: "Graph", icon: Network, description: "Relationship graph" },
];

interface World {
  id: string;
  name: string;
  description?: string | null;
  image?: string | null;
  userId: string;
  campaignId?: string | null;
  homeContent?: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function WorldBuilder() {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedWorldId, setSelectedWorldId] = useState<string>("");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<ActiveSection>("home");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("");
  const [showCreateInline, setShowCreateInline] = useState(false);
  const [entityHistory, setEntityHistory] = useState<string[]>([]);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [editingMapId, setEditingMapId] = useState<string | null>(null);
  const [creatingMap, setCreatingMap] = useState(false);
  const [selectedTimelineId, setSelectedTimelineId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showCreateWorldDialog, setShowCreateWorldDialog] = useState(false);
  const [newWorldName, setNewWorldName] = useState("");
  const [newWorldDescription, setNewWorldDescription] = useState("");
  const [showWorldSettingsDialog, setShowWorldSettingsDialog] = useState(false);
  const [editWorldName, setEditWorldName] = useState("");
  const [editWorldDescription, setEditWorldDescription] = useState("");
  const [showDeleteWorldConfirm, setShowDeleteWorldConfirm] = useState(false);
  const [deleteEntityConfirm, setDeleteEntityConfirm] = useState<string | null>(null);
  const [homeContentDraft, setHomeContentDraft] = useState("");
  const [homeContentDirty, setHomeContentDirty] = useState(false);

  const { data: worlds = [], isLoading: worldsLoading } = useQuery<World[]>({
    queryKey: ['/api/worlds'],
    queryFn: async () => {
      const res = await fetch('/api/worlds', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (worlds.length > 0 && !selectedWorldId) {
      setSelectedWorldId(worlds[0].id);
    }
  }, [worlds, selectedWorldId]);

  const selectedWorld = worlds.find(w => w.id === selectedWorldId);

  useEffect(() => {
    if (selectedWorld) {
      setHomeContentDraft(selectedWorld.homeContent || "");
      setHomeContentDirty(false);
      setEditWorldName(selectedWorld.name);
      setEditWorldDescription(selectedWorld.description || "");
    }
  }, [selectedWorld?.id, selectedWorld?.homeContent]);

  const createWorldMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const res = await fetch('/api/worlds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create world');
      return res.json();
    },
    onSuccess: (newWorld: World) => {
      queryClient.invalidateQueries({ queryKey: ['/api/worlds'] });
      setSelectedWorldId(newWorld.id);
      setShowCreateWorldDialog(false);
      setNewWorldName("");
      setNewWorldDescription("");
      toast({ title: "World created" });
    },
  });

  const updateWorldMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; homeContent?: string }) => {
      const res = await fetch(`/api/worlds/${selectedWorldId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update world');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/worlds'] });
      setShowWorldSettingsDialog(false);
      toast({ title: "World updated" });
    },
  });

  const deleteWorldMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/worlds/${selectedWorldId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete world');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/worlds'] });
      setSelectedWorldId("");
      setShowDeleteWorldConfirm(false);
      setShowWorldSettingsDialog(false);
      toast({ title: "World deleted" });
    },
  });

  useWorldbuildingSync(selectedWorldId);
  const { data: entities = [], isLoading: entitiesLoading } = useEntities(selectedWorldId || undefined);
  const { data: links = [] } = useEntityLinks(selectedWorldId || undefined);
  const { data: timelines = [], isLoading: timelinesLoading } = useTimelines(selectedWorldId || undefined);
  const { data: timelineEvents = [] } = useTimelineEvents(selectedWorldId || undefined);
  const { data: selectedEntity } = useEntity(
    selectedWorldId || undefined,
    selectedEntityId || undefined
  );
  const deleteEntityMutation = useDeleteEntity(selectedWorldId || undefined);

  const { data: shareLink } = useQuery<any>({
    queryKey: ['/api/worlds', selectedWorldId, 'share-link'],
    queryFn: async () => {
      const res = await fetch(`/api/worlds/${selectedWorldId}/share-link`, { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!selectedWorldId,
  });

  const createShareLink = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/worlds/${selectedWorldId}/share-link`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to create share link');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/worlds', selectedWorldId, 'share-link'] });
      toast({ title: "Share link created" });
    },
  });

  const deleteShareLink = useMutation({
    mutationFn: async (linkId: string) => {
      const res = await fetch(`/api/worlds/${selectedWorldId}/share-link/${linkId}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to revoke share link');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/worlds', selectedWorldId, 'share-link'] });
      toast({ title: "Share link revoked" });
    },
  });

  const shareLinkUrl = shareLink?.token ? `${window.location.origin}/world/${shareLink.token}` : null;

  const handleCopyShareLink = () => {
    if (shareLinkUrl) {
      navigator.clipboard.writeText(shareLinkUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleDeleteEntity = async () => {
    if (!deleteEntityConfirm) return;
    try {
      await deleteEntityMutation.mutateAsync(deleteEntityConfirm);
      if (selectedEntityId === deleteEntityConfirm) {
        setSelectedEntityId(null);
      }
      toast({ title: "Entity deleted" });
    } catch {
      toast({ title: "Failed to delete entity", variant: "destructive" });
    }
    setDeleteEntityConfirm(null);
  };

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

  const timelineEventCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    timelineEvents.forEach(e => {
      const key = e.timelineId || "__unassigned";
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [timelineEvents]);

  const filteredTimelines = useMemo(() => {
    if (!searchQuery) return timelines;
    const q = searchQuery.toLowerCase();
    return timelines.filter(t => t.name.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q));
  }, [timelines, searchQuery]);

  const handleSelectTimeline = (timelineId: string | null) => {
    setSelectedTimelineId(timelineId);
    setActiveSection("timeline");
    if (isMobile) {
      setMobileSidebarOpen(false);
    }
  };

  const handleSelectEntity = (entityId: string) => {
    if (selectedEntityId) {
      setEntityHistory(prev => [...prev.slice(-20), selectedEntityId]);
    }
    setSelectedEntityId(entityId);
    setActiveSection("encyclopedia");
    if (isMobile) {
      setMobileSidebarOpen(false);
    }
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

  const openWorldSettings = () => {
    if (selectedWorld) {
      setEditWorldName(selectedWorld.name);
      setEditWorldDescription(selectedWorld.description || "");
      setShowWorldSettingsDialog(true);
    }
  };

  const sectionNavContent = (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-stone-700">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-amber-400" />
            <h2 className="text-xs font-semibold text-stone-300 uppercase tracking-wider">World Builder</h2>
          </div>
          <div className="flex items-center gap-1">
            {selectedWorldId && (
              <Button variant="ghost" size="icon" className="h-6 w-6 text-stone-500 hover:text-stone-300" onClick={openWorldSettings} data-testid="button-world-settings">
                <Settings className="h-3.5 w-3.5" />
              </Button>
            )}
            {isMobile && (
              <Button variant="ghost" size="icon" className="h-6 w-6 text-stone-500 hover:text-stone-300" onClick={() => setMobileSidebarOpen(false)} data-testid="button-close-mobile-sidebar">
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {worlds.length > 0 && (
            <Select value={selectedWorldId} onValueChange={(val) => { setSelectedWorldId(val); setSelectedEntityId(null); }}>
              <SelectTrigger className="w-full bg-stone-800 border-stone-700 text-stone-200 h-7 text-xs" data-testid="select-world">
                <SelectValue placeholder="Select World" />
              </SelectTrigger>
              <SelectContent className="bg-stone-800 border-stone-700">
                {worlds.map((w: World) => (
                  <SelectItem key={w.id} value={w.id} className="text-stone-200 focus:bg-stone-700 focus:text-stone-100 text-xs">
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0 text-amber-400 hover:text-amber-300" onClick={() => setShowCreateWorldDialog(true)} data-testid="button-create-world">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <nav className="p-2 border-b border-stone-800">
        {SECTION_CONFIG.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => {
              setActiveSection(key);
              if (key !== "encyclopedia") setSelectedEntityId(null);
              if (key !== "timeline") setSelectedTimelineId(null);
              if (key === "home" && selectedWorld) {
                setEditWorldName(selectedWorld.name);
                setEditWorldDescription(selectedWorld.description || "");
              }
              if (isMobile && key !== "encyclopedia" && key !== "timeline") setMobileSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs transition-colors mb-0.5 ${
              activeSection === key
                ? 'bg-amber-500/10 text-amber-400 border-l-2 border-amber-400'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/50'
            }`}
            data-testid={`nav-section-${key}`}
          >
            <Icon className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="font-medium">{label}</span>
          </button>
        ))}
      </nav>

      {activeSection === "encyclopedia" && selectedWorldId && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-2 border-b border-stone-800">
            <div className="flex items-center gap-1 mb-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1.5 h-3 w-3 text-stone-500" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="pl-7 h-6 text-[11px] bg-stone-800 border-stone-700 text-stone-200"
                  data-testid="input-wiki-search"
                />
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-amber-400 hover:text-amber-300" onClick={() => setShowCreateInline(!showCreateInline)} data-testid="button-new-entity">
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-0.5">
              <Badge
                variant={filterType === "" ? "default" : "outline"}
                className={`text-[8px] cursor-pointer px-1 py-0 ${filterType === "" ? "bg-amber-500/20 text-amber-400 border-amber-500/50" : "border-stone-700 text-stone-500 hover:text-stone-300"}`}
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
                    className={`text-[8px] cursor-pointer px-1 py-0 ${filterType === key ? "text-white" : "border-stone-700 text-stone-500 hover:text-stone-300"}`}
                    style={filterType === key ? { backgroundColor: cfg.color + "33", color: cfg.color, borderColor: cfg.color + "55" } : {}}
                    onClick={() => setFilterType(filterType === key ? "" : key)}
                  >
                    {cfg.label} ({count})
                  </Badge>
                );
              })}
            </div>
          </div>

          <ScrollArea className="flex-1">
            {!searchQuery && !filterType && recentEntities.length > 0 && (
              <div className="px-2 py-1.5 border-b border-stone-800">
                <h3 className="text-[9px] font-medium text-stone-500 uppercase tracking-wider mb-1">Recently Edited</h3>
                {recentEntities.slice(0, 5).map(e => {
                  const cfg = ENTITY_TYPE_CONFIG[e.entityType];
                  const IconComp = cfg ? ICON_MAP[cfg.icon] || Search : Search;
                  return (
                    <button
                      key={e.id}
                      onClick={() => handleSelectEntity(e.id)}
                      className={`w-full text-left px-2 py-1 rounded text-[11px] flex items-center gap-2 transition-colors ${selectedEntityId === e.id ? 'bg-stone-800 text-amber-400' : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/50'}`}
                      data-testid={`recent-entity-${e.id}`}
                    >
                      <IconComp className="h-3 w-3 flex-shrink-0" style={{ color: cfg?.color }} />
                      <span className="truncate">{e.displayName}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="p-2 space-y-0.5">
              {entitiesLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-stone-600" /></div>
              ) : filteredEntities.length === 0 ? (
                <div className="text-center py-6 text-stone-600 text-xs">
                  {searchQuery ? "No matching articles" : "No articles yet — create one!"}
                </div>
              ) : (
                filteredEntities.map(entity => {
                  const cfg = ENTITY_TYPE_CONFIG[entity.entityType];
                  const IconComp = cfg ? ICON_MAP[cfg.icon] || Search : Search;
                  return (
                    <button
                      key={entity.id}
                      onClick={() => handleSelectEntity(entity.id)}
                      className={`w-full text-left px-2 py-1.5 rounded-md transition-colors group flex items-center gap-2 ${
                        selectedEntityId === entity.id
                          ? 'bg-stone-800 border-l-2 border-amber-400'
                          : 'hover:bg-stone-800/60'
                      }`}
                      data-testid={`entity-list-item-${entity.id}`}
                    >
                      <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: cfg?.color + "18" }}>
                        <IconComp className="h-2.5 w-2.5" style={{ color: cfg?.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-[11px] font-medium truncate ${selectedEntityId === entity.id ? 'text-amber-400' : 'text-stone-300 group-hover:text-stone-100'}`}>
                          {entity.displayName}
                        </div>
                        {entity.description && (
                          <div className="text-[9px] text-stone-500 truncate">{entity.description}</div>
                        )}
                      </div>
                      {entity.visibility === "gm_only" && (
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500/50 flex-shrink-0" title="GM Only" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {activeSection === "timeline" && selectedWorldId && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-2 border-b border-stone-800">
            <div className="flex items-center gap-1 mb-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1.5 h-3 w-3 text-stone-500" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search timelines..."
                  className="pl-7 h-6 text-[11px] bg-stone-800 border-stone-700 text-stone-200"
                  data-testid="input-timeline-search"
                />
              </div>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-0.5">
              {timelinesLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-stone-600" /></div>
              ) : filteredTimelines.length === 0 && !searchQuery ? (
                <div className="text-center py-6 text-stone-600 text-xs">
                  No timelines yet — create one from the timeline panel!
                </div>
              ) : filteredTimelines.length === 0 ? (
                <div className="text-center py-6 text-stone-600 text-xs">
                  No matching timelines
                </div>
              ) : (
                filteredTimelines.map(tl => {
                  const tlColor = tl.color || "#64b5f6";
                  const eventCount = timelineEventCounts[tl.id] || 0;
                  const isSelected = selectedTimelineId === tl.id;
                  return (
                    <button
                      key={tl.id}
                      onClick={() => handleSelectTimeline(tl.id)}
                      className={`w-full text-left px-2 py-1.5 rounded-md transition-colors group flex items-center gap-2 ${
                        isSelected
                          ? 'bg-stone-800 border-l-2 border-amber-400'
                          : 'hover:bg-stone-800/60'
                      }`}
                      data-testid={`timeline-sidebar-item-${tl.id}`}
                    >
                      <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: tlColor + "18" }}>
                        <Clock className="h-2.5 w-2.5" style={{ color: tlColor }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-[11px] font-medium truncate ${isSelected ? 'text-amber-400' : 'text-stone-300 group-hover:text-stone-100'}`}>
                          {tl.name}
                        </div>
                        <div className="text-[9px] text-stone-500">{eventCount} event{eventCount !== 1 ? 's' : ''}</div>
                      </div>
                      {tl.visibility === "gm_only" && (
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500/50 flex-shrink-0" title="GM Only" />
                      )}
                    </button>
                  );
                })
              )}

              {(timelineEventCounts["__unassigned"] || 0) > 0 && !searchQuery && (
                <button
                  onClick={() => handleSelectTimeline(null)}
                  className={`w-full text-left px-2 py-1.5 rounded-md transition-colors group flex items-center gap-2 mt-1 ${
                    selectedTimelineId === null && activeSection === "timeline"
                      ? 'bg-stone-800 border-l-2 border-amber-400'
                      : 'hover:bg-stone-800/60'
                  }`}
                  data-testid="timeline-sidebar-unassigned"
                >
                  <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 bg-stone-800">
                    <Clock className="h-2.5 w-2.5 text-stone-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium text-stone-400">Unassigned</div>
                    <div className="text-[9px] text-stone-500">{timelineEventCounts["__unassigned"]} event{timelineEventCounts["__unassigned"] !== 1 ? 's' : ''}</div>
                  </div>
                </button>
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-screen overflow-hidden bg-stone-950 text-stone-100" data-testid="worldbuilder-page">
      <header className="border-b border-stone-800 bg-stone-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center justify-between px-2 md:px-4 py-2 gap-2">
          <div className="flex items-center gap-1.5 md:gap-3 min-w-0">
            {selectedWorldId && (
              <Button variant="ghost" size="icon" className="md:hidden h-8 w-8 text-stone-400 hover:text-stone-200 flex-shrink-0" onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)} data-testid="button-toggle-mobile-sidebar">
                <Menu className="h-4 w-4" />
              </Button>
            )}
            <Link href="/">
              <Button variant="ghost" size="icon" className="text-stone-400 hover:text-stone-200 h-8 w-8 flex-shrink-0" data-testid="button-back-home">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="hidden md:flex items-center gap-2">
              <Globe className="h-5 w-5 text-amber-400" />
              <h1 className="text-base font-semibold text-stone-200">World Builder</h1>
            </div>
            <Globe className="md:hidden h-5 w-5 text-amber-400 flex-shrink-0" />
            {selectedWorldId && (
              <div className="flex items-center">
                <Badge variant="outline" className="text-[10px] border-stone-700 text-stone-400 px-1.5 py-0">
                  {SECTION_CONFIG.find(s => s.key === activeSection)?.label}
                </Badge>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 md:gap-3 flex-shrink-0">
            {selectedWorldId && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-stone-400 hover:text-amber-400" data-testid="button-share-world">
                    <Share2 className="h-3.5 w-3.5" />
                    <span className="hidden md:inline text-xs">Share</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 bg-stone-900 border-stone-700 p-3" align="end">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Share2 className="h-4 w-4 text-amber-400" />
                      <h3 className="text-sm font-semibold text-stone-200">Share World</h3>
                    </div>
                    <p className="text-[11px] text-stone-500">Share a read-only link to your world. Players and visitors can view articles, maps, timeline, and calendar without logging in. GM-only content stays hidden.</p>
                    {shareLinkUrl ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Input value={shareLinkUrl} readOnly className="h-7 text-[10px] bg-stone-800 border-stone-700 text-stone-300 font-mono" data-testid="input-share-link" />
                          <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0 text-stone-400 hover:text-amber-400" onClick={handleCopyShareLink} data-testid="button-copy-share-link">
                            {copiedLink ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                          <a href={shareLinkUrl} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0 text-stone-400 hover:text-amber-400" data-testid="button-open-share-link">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </a>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full h-7 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          onClick={() => shareLink?.id && deleteShareLink.mutate(shareLink.id)}
                          disabled={deleteShareLink.isPending}
                          data-testid="button-revoke-share-link"
                        >
                          <Trash2 className="h-3 w-3 mr-1.5" />
                          Revoke Link
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full h-8 bg-amber-600 hover:bg-amber-500 text-white text-xs"
                        onClick={() => createShareLink.mutate()}
                        disabled={createShareLink.isPending}
                        data-testid="button-generate-share-link"
                      >
                        {createShareLink.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Share2 className="h-3.5 w-3.5 mr-1.5" />}
                        Generate Share Link
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            )}
            <ProfileDropdown onLogout={handleLogout} />
          </div>
        </div>
      </header>

      {worldsLoading ? (
        <div className="flex items-center justify-center h-[calc(100vh-49px)]">
          <Loader2 className="h-8 w-8 animate-spin text-stone-500" />
        </div>
      ) : worlds.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[calc(100vh-49px)] p-6 text-center">
          <Globe className="h-16 w-16 text-stone-700 mb-4" />
          <h2 className="text-lg font-semibold text-stone-500 mb-2" data-testid="text-no-worlds">Create Your First World</h2>
          <p className="text-stone-600 text-sm max-w-md mb-4">Worlds are independent containers for your worldbuilding. Create articles, maps, timelines, and calendars all in one place.</p>
          <Button className="bg-amber-600 hover:bg-amber-500 text-white" onClick={() => setShowCreateWorldDialog(true)} data-testid="button-create-first-world">
            <Plus className="h-4 w-4 mr-2" /> Create World
          </Button>
        </div>
      ) : (
        <div className="flex h-[calc(100vh-49px)] relative">
          {isMobile && mobileSidebarOpen && (
            <div className="absolute inset-0 z-40 bg-black/50" onClick={() => setMobileSidebarOpen(false)} data-testid="mobile-sidebar-backdrop" />
          )}

          {isMobile ? (
            <div className={`absolute inset-y-0 left-0 z-50 w-full max-w-xs bg-stone-900 border-r border-stone-800 flex flex-col transition-transform duration-200 ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`} data-testid="mobile-sidebar">
              {sectionNavContent}
            </div>
          ) : (
            <div className={`${sidebarCollapsed ? 'w-12' : 'w-64'} border-r border-stone-800 bg-stone-900/50 flex-shrink-0 flex flex-col transition-all duration-200`}>
              {sidebarCollapsed ? (
                <div className="flex flex-col items-center py-3 gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-stone-400 hover:text-stone-200 mb-2" onClick={() => setSidebarCollapsed(false)} data-testid="button-expand-sidebar">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  {SECTION_CONFIG.map(({ key, icon: Icon }) => (
                    <Button
                      key={key}
                      variant="ghost"
                      size="icon"
                      className={`h-8 w-8 ${activeSection === key ? 'text-amber-400' : 'text-stone-500 hover:text-stone-300'}`}
                      onClick={() => { setActiveSection(key); if (key !== "encyclopedia") setSelectedEntityId(null); if (key === "home" && selectedWorld) { setEditWorldName(selectedWorld.name); setEditWorldDescription(selectedWorld.description || ""); } }}
                      data-testid={`nav-section-collapsed-${key}`}
                    >
                      <Icon className="h-4 w-4" />
                    </Button>
                  ))}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-end p-1 border-b border-stone-800">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-stone-500 hover:text-stone-300" onClick={() => setSidebarCollapsed(true)} data-testid="button-collapse-sidebar">
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {sectionNavContent}
                </>
              )}
            </div>
          )}

          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            {activeSection === "home" && selectedWorldId && selectedWorld && (
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
                  <div className="flex items-center gap-3 mb-2">
                    <Home className="h-6 w-6 text-amber-400" />
                    <h2 className="text-xl font-bold text-stone-100" data-testid="text-home-editor-title">Home Page Editor</h2>
                  </div>
                  <p className="text-xs text-stone-500">
                    Edit the content visitors see when they open your shared world link. This is the landing page of your world's wiki.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs text-stone-400">World Name</Label>
                      <Input
                        value={editWorldName}
                        onChange={(e) => setEditWorldName(e.target.value)}
                        placeholder="World name..."
                        className="mt-1 bg-stone-800 border-stone-700 text-stone-200"
                        data-testid="input-home-world-name"
                      />
                    </div>

                    <div>
                      <Label className="text-xs text-stone-400">Description / Lore Blurb</Label>
                      <Textarea
                        value={editWorldDescription}
                        onChange={(e) => setEditWorldDescription(e.target.value)}
                        placeholder="A short description or lore blurb shown beneath the world name..."
                        className="mt-1 bg-stone-800 border-stone-700 text-stone-200 min-h-[80px]"
                        data-testid="input-home-world-description"
                      />
                    </div>

                    <div>
                      <Label className="text-xs text-stone-400">Home Page Content (Markdown)</Label>
                      <Textarea
                        value={homeContentDraft}
                        onChange={(e) => { setHomeContentDraft(e.target.value); setHomeContentDirty(true); }}
                        placeholder="Write the main article content for your world's home page. Supports markdown formatting..."
                        className="mt-1 bg-stone-800 border-stone-700 text-stone-200 min-h-[300px] font-mono text-sm"
                        data-testid="input-home-content"
                      />
                      <p className="text-[10px] text-stone-600 mt-1">This content is displayed as the main body of your world's wiki landing page.</p>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <Button
                        onClick={() => {
                          updateWorldMutation.mutate({
                            name: editWorldName.trim(),
                            description: editWorldDescription.trim() || undefined,
                            homeContent: homeContentDraft,
                          });
                          setHomeContentDirty(false);
                        }}
                        disabled={!editWorldName.trim() || updateWorldMutation.isPending}
                        className="bg-amber-600 hover:bg-amber-500 text-white"
                        data-testid="button-save-home-content"
                      >
                        {updateWorldMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        {updateWorldMutation.isPending ? "Saving..." : "Save Home Page"}
                      </Button>
                      {homeContentDirty && (
                        <span className="text-[10px] text-amber-400">Unsaved changes</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === "encyclopedia" && (
              <>
                {selectedEntityId && selectedEntity ? (
                  <div className="flex-1 flex overflow-hidden">
                    <div className="flex-1 overflow-hidden flex flex-col min-w-0">
                      <div className="flex items-center gap-2 px-2 md:px-4 py-2 border-b border-stone-800 bg-stone-900/30">
                        {entityHistory.length > 0 && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-400 hover:text-stone-200 flex-shrink-0" onClick={handleBack} data-testid="button-back-entity">
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                        )}
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {(() => {
                            const cfg = ENTITY_TYPE_CONFIG[selectedEntity.entityType];
                            const IconComp = cfg ? ICON_MAP[cfg.icon] || Search : Search;
                            return (
                              <>
                                <IconComp className="h-4 w-4 flex-shrink-0" style={{ color: cfg?.color }} />
                                <Badge variant="outline" className="text-[10px] border-stone-600 text-stone-400 flex-shrink-0">{cfg?.label}</Badge>
                              </>
                            );
                          })()}
                          <span className="text-[10px] text-stone-600 hidden md:inline">
                            {selectedEntity.visibility === "gm_only" ? "GM Only" : selectedEntity.visibility === "player_visible" ? "Players" : "Shared"}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-stone-500 hover:text-red-400 flex-shrink-0"
                          onClick={() => setDeleteEntityConfirm(selectedEntityId)}
                          data-testid="button-delete-entity"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        {isMobile && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-400 hover:text-amber-400 flex-shrink-0" onClick={() => setMobileDetailOpen(true)} data-testid="button-open-mobile-detail">
                            <Info className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div className="flex-1 overflow-y-auto">
                        <WikiArticleEditor
                          entity={selectedEntity}
                          worldId={selectedWorldId}
                          isGM={true}
                        />
                      </div>
                    </div>

                    <div className="hidden md:block w-72 border-l border-stone-800 bg-stone-900/30 flex-shrink-0 overflow-y-auto">
                      <EntitySidePanel
                        worldId={selectedWorldId}
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
                    <div className="text-center p-4 md:p-8">
                      <Globe className="h-12 md:h-16 w-12 md:w-16 text-stone-800 mx-auto mb-4" />
                      <h2 className="text-lg md:text-xl font-semibold text-stone-600 mb-2">Your World Awaits</h2>
                      <p className="text-stone-600 text-xs md:text-sm mb-6">Select an article from the sidebar or create a new one to start building your world's encyclopedia.</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3 max-w-sm mx-auto">
                        {Object.entries(ENTITY_TYPE_CONFIG).slice(0, 6).map(([key, cfg]) => {
                          const IconComp = ICON_MAP[cfg.icon] || Search;
                          return (
                            <div key={key} className="flex flex-col items-center gap-1 p-2 md:p-3 rounded-lg bg-stone-900/50 border border-stone-800">
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

            {activeSection === "maps" && (
              <>
                {editingMapId || creatingMap ? (
                  <WorldMapEditor
                    worldId={selectedWorldId}
                    mapId={editingMapId || undefined}
                    onBack={() => { setEditingMapId(null); setCreatingMap(false); }}
                    onMapCreated={(newId) => { setCreatingMap(false); setEditingMapId(newId); }}
                  />
                ) : (
                  <WorldMapViewer
                    worldId={selectedWorldId}
                    isGM={true}
                    onEditMap={(mapId) => setEditingMapId(mapId)}
                    onCreateMap={() => setCreatingMap(true)}
                    onNavigateToEntity={(entityId) => {
                      handleSelectEntity(entityId);
                      setActiveSection("encyclopedia");
                    }}
                  />
                )}
              </>
            )}

            {activeSection === "timeline" && selectedWorldId && (
              <div className="flex-1 overflow-y-auto">
                <TimelineView
                  worldId={selectedWorldId}
                  isGM={true}
                  onSelectEntity={handleSelectEntity}
                  selectedTimelineId={selectedTimelineId}
                  onSelectTimeline={handleSelectTimeline}
                />
              </div>
            )}

            {activeSection === "calendar" && selectedWorldId && (
              <div className="flex-1 overflow-hidden">
                <WorldCalendar worldId={selectedWorldId} isGM={true} />
              </div>
            )}

            {activeSection === "graph" && (
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

      {isMobile && mobileDetailOpen && selectedEntityId && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/50" onClick={() => setMobileDetailOpen(false)} data-testid="mobile-detail-backdrop" />
          <div className="fixed inset-y-0 right-0 z-[70] w-full max-w-sm bg-stone-900 border-l border-stone-800 shadow-2xl overflow-y-auto" data-testid="mobile-detail-panel">
            <EntitySidePanel
              worldId={selectedWorldId}
              entityId={selectedEntityId}
              onClose={() => setMobileDetailOpen(false)}
              onNavigateToEntity={(id) => { setMobileDetailOpen(false); handleSelectEntity(id); }}
              isGM={true}
              embedded={false}
            />
          </div>
        </>
      )}

      {showCreateInline && selectedWorldId && (
        <WorldbuilderPanel
          worldId={selectedWorldId}
          isGM={true}
          onOpenEntity={handleSelectEntity}
          createOnly={true}
          onCloseCreate={() => setShowCreateInline(false)}
        />
      )}

      <Dialog open={showCreateWorldDialog} onOpenChange={setShowCreateWorldDialog}>
        <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 max-w-md" data-testid="dialog-create-world">
          <DialogHeader>
            <DialogTitle className="text-stone-100">Create New World</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-stone-400">Name *</Label>
              <Input
                value={newWorldName}
                onChange={(e) => setNewWorldName(e.target.value)}
                placeholder="World name..."
                className="mt-1 bg-stone-800 border-stone-700 text-stone-200"
                data-testid="input-world-name"
              />
            </div>
            <div>
              <Label className="text-xs text-stone-400">Description</Label>
              <Textarea
                value={newWorldDescription}
                onChange={(e) => setNewWorldDescription(e.target.value)}
                placeholder="Brief description of your world..."
                className="mt-1 bg-stone-800 border-stone-700 text-stone-200 min-h-[60px]"
                data-testid="input-world-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreateWorldDialog(false)} className="text-stone-400" data-testid="button-cancel-create-world">Cancel</Button>
            <Button
              onClick={() => createWorldMutation.mutate({ name: newWorldName.trim(), description: newWorldDescription.trim() || undefined })}
              disabled={!newWorldName.trim() || createWorldMutation.isPending}
              className="bg-amber-600 hover:bg-amber-500 text-white"
              data-testid="button-confirm-create-world"
            >
              {createWorldMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showWorldSettingsDialog} onOpenChange={setShowWorldSettingsDialog}>
        <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 max-w-md" data-testid="dialog-world-settings">
          <DialogHeader>
            <DialogTitle className="text-stone-100">World Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-stone-400">Name</Label>
              <Input
                value={editWorldName}
                onChange={(e) => setEditWorldName(e.target.value)}
                placeholder="World name..."
                className="mt-1 bg-stone-800 border-stone-700 text-stone-200"
                data-testid="input-edit-world-name"
              />
            </div>
            <div>
              <Label className="text-xs text-stone-400">Description</Label>
              <Textarea
                value={editWorldDescription}
                onChange={(e) => setEditWorldDescription(e.target.value)}
                placeholder="Brief description..."
                className="mt-1 bg-stone-800 border-stone-700 text-stone-200 min-h-[60px]"
                data-testid="input-edit-world-description"
              />
            </div>
          </div>
          <DialogFooter className="flex justify-between items-center">
            <Button
              variant="ghost"
              size="sm"
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
              onClick={() => setShowDeleteWorldConfirm(true)}
              data-testid="button-delete-world"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete World
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setShowWorldSettingsDialog(false)} className="text-stone-400">Cancel</Button>
              <Button
                onClick={() => updateWorldMutation.mutate({ name: editWorldName.trim(), description: editWorldDescription.trim() || undefined })}
                disabled={!editWorldName.trim() || updateWorldMutation.isPending}
                className="bg-amber-600 hover:bg-amber-500 text-white"
                data-testid="button-save-world-settings"
              >
                {updateWorldMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteWorldConfirm} onOpenChange={setShowDeleteWorldConfirm}>
        <AlertDialogContent className="bg-stone-900 border-stone-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-stone-200">Delete World</AlertDialogTitle>
            <AlertDialogDescription className="text-stone-400">
              This will permanently delete all articles, maps, timelines, and calendars in this world. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-stone-800 border-stone-700 text-stone-300 hover:bg-stone-700" data-testid="button-cancel-delete-world">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-500 text-white"
              onClick={() => deleteWorldMutation.mutate()}
              data-testid="button-confirm-delete-world"
            >
              {deleteWorldMutation.isPending ? "Deleting..." : "Delete World"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteEntityConfirm} onOpenChange={() => setDeleteEntityConfirm(null)}>
        <AlertDialogContent className="bg-stone-900 border-stone-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-stone-200">Delete {selectedEntity?.displayName || "Entity"}?</AlertDialogTitle>
            <AlertDialogDescription className="text-stone-400">
              This will permanently delete this entity and its article content. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-stone-800 border-stone-700 text-stone-300 hover:bg-stone-700" data-testid="button-cancel-delete-entity">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-500 text-white"
              onClick={handleDeleteEntity}
              data-testid="button-confirm-delete-entity"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
