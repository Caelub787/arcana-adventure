import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
import { useEntities, useEntityLinks, useEntity, useDeleteEntity, useWorldbuildingSync, ENTITY_TYPE_CONFIG, TAG_COLORS, type Entity, useWorldMaps, useTimelines, useTimelineEvents, type WorldTimeline, useDeleteTimeline, useDeleteWorldMap } from "@/lib/worldbuilding-api";
import { PREDEFINED_TAGS } from "@shared/schema";
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
import { ArrowLeft, Globe, Loader2, Network, Clock, FileText, ChevronLeft, BookOpen, Search, Plus, User, MapPin, Shield, Scroll, Calendar, Package, Swords, Sparkles, Menu, X, Info, Map, Share2, ChevronRight, Copy, Check, Trash2, ExternalLink, Settings, Home, Save, Eye, Pencil, Layout, Tag } from "lucide-react";
import ProfileDropdown from "@/components/ProfileDropdown";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";

const ICON_MAP: Record<string, React.ElementType> = {
  User, MapPin, Shield, Scroll, Calendar, BookOpen, Package, Swords, Search, Sparkles, Clock, FileText, Layout,
};

function renderHomeContent(content: string) {
  const lines = content.split("\n");
  return lines.map((line, i) => {
    if (line.startsWith("### ")) return <h3 key={i} className="text-lg font-semibold text-amber-200/90 mt-6 mb-3 flex items-center gap-2"><span className="w-6 h-px bg-amber-500/40" />{line.slice(4)}</h3>;
    if (line.startsWith("## ")) return <h2 key={i} className="text-xl font-bold text-amber-100 mt-8 mb-3 pb-2 border-b border-amber-500/20">{line.slice(3)}</h2>;
    if (line.startsWith("# ")) return <h1 key={i} className="text-2xl font-bold text-stone-100 mt-8 mb-4 pb-2 border-b border-amber-500/30">{line.slice(2)}</h1>;
    if (line.startsWith("- ")) return <li key={i} className="ml-5 text-stone-300 text-sm list-disc marker:text-amber-500/50 leading-relaxed">{line.slice(2)}</li>;
    if (line.startsWith("---")) return <div key={i} className="my-8 flex items-center gap-4"><div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" /><Sparkles className="h-3 w-3 text-amber-500/40" /><div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" /></div>;
    if (line.trim() === "") return <div key={i} className="h-3" />;
    const formatted = line
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-stone-100 font-semibold">$1</strong>')
      .replace(/\*(.+?)\*/g, '<em class="text-amber-200/70">$1</em>');
    return <p key={i} className="text-stone-300 text-[15px] leading-[1.8]" dangerouslySetInnerHTML={{ __html: formatted }} />;
  });
}

type ActiveSection = "home" | "encyclopedia" | "maps" | "timeline" | "calendar" | "graph";
type WbTabType = "home" | "encyclopedia" | "article" | "maps" | "map-edit" | "timeline" | "calendar" | "graph";

interface WbTab {
  id: string;
  type: WbTabType;
  title: string;
  entityId?: string;
  mapId?: string | null;
  selectedTimelineId?: string | null;
}

const SECTION_CONFIG: { key: ActiveSection; label: string; icon: React.ElementType; description: string }[] = [
  { key: "home", label: "Home", icon: Home, description: "World home page" },
  { key: "encyclopedia", label: "Encyclopedia", icon: BookOpen, description: "Wiki articles & entities" },
  { key: "maps", label: "Maps", icon: Map, description: "Interactive world maps" },
  { key: "timeline", label: "Timeline", icon: Clock, description: "Dynamic timeline" },
  { key: "calendar", label: "Calendar", icon: Calendar, description: "Custom calendars" },
  { key: "graph", label: "Graph", icon: Network, description: "Relationship graph" },
];

const TAB_TYPE_ICONS: Record<WbTabType, { icon: React.ElementType; label: string }> = {
  home: { icon: Home, label: "Home" },
  encyclopedia: { icon: BookOpen, label: "Encyclopedia" },
  article: { icon: FileText, label: "Article" },
  maps: { icon: Map, label: "Maps" },
  "map-edit": { icon: Map, label: "Map Editor" },
  timeline: { icon: Clock, label: "Timeline" },
  calendar: { icon: Calendar, label: "Calendar" },
  graph: { icon: Network, label: "Graph" },
};

interface World {
  id: string;
  name: string;
  description?: string | null;
  image?: string | null;
  userId: string;
  campaignId?: string | null;
  homeContent?: string | null;
  customTags?: string[] | null;
  system?: string | null;
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
  const [wbTabs, setWbTabs] = useState<WbTab[]>(() => {
    try {
      const saved = localStorage.getItem("wb-tabs");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [activeWbTabId, setActiveWbTabId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("wb-active-tab") || null;
    } catch { return null; }
  });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: "entity" | "timeline"; id: string; name: string } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showCreateWorldDialog, setShowCreateWorldDialog] = useState(false);
  const [newWorldName, setNewWorldName] = useState("");
  const [newWorldDescription, setNewWorldDescription] = useState("");
  const [showWorldSettingsDialog, setShowWorldSettingsDialog] = useState(false);
  const [editWorldName, setEditWorldName] = useState("");
  const [editWorldDescription, setEditWorldDescription] = useState("");
  const [editCustomTags, setEditCustomTags] = useState<string[]>([]);
  const [editWorldSystem, setEditWorldSystem] = useState("arcana-adventure");
  const [newCustomTag, setNewCustomTag] = useState("");
  const [showDeleteWorldConfirm, setShowDeleteWorldConfirm] = useState(false);
  const [wikiLinkPreview, setWikiLinkPreview] = useState<{ type: string; id: string } | null>(null);
  const [deleteEntityConfirm, setDeleteEntityConfirm] = useState<string | null>(null);
  const [homeContentDraft, setHomeContentDraft] = useState("");
  const [homeContentDirty, setHomeContentDirty] = useState(false);
  const [homeEditorMode, setHomeEditorMode] = useState<"preview" | "edit">("preview");

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

  const makeTabId = () => `wb-tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  useEffect(() => {
    if (selectedWorldId && wbTabs.length === 0) {
      const tabId = makeTabId();
      setWbTabs([{ id: tabId, type: "home", title: "Home" }]);
      setActiveWbTabId(tabId);
      setActiveSection("home");
    }
  }, [selectedWorldId]);

  useEffect(() => {
    try {
      localStorage.setItem("wb-tabs", JSON.stringify(wbTabs));
    } catch {}
  }, [wbTabs]);

  useEffect(() => {
    try {
      if (activeWbTabId) {
        localStorage.setItem("wb-active-tab", activeWbTabId);
      } else {
        localStorage.removeItem("wb-active-tab");
      }
    } catch {}
  }, [activeWbTabId]);

  useEffect(() => {
    if (wbTabs.length > 0 && activeWbTabId) {
      const tab = wbTabs.find(t => t.id === activeWbTabId);
      if (tab) {
        if (tab.type === "article" && tab.entityId) {
          setSelectedEntityId(tab.entityId);
          setActiveSection("encyclopedia");
        } else if (tab.type === "map-edit" && tab.mapId) {
          setEditingMapId(tab.mapId);
          setActiveSection("maps");
        } else {
          setActiveSection(tab.type as ActiveSection);
        }
      }
    }
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [contextMenu]);

  const deleteTimelineMutation = useDeleteTimeline(selectedWorldId || undefined);

  const activeTab = wbTabs.find(t => t.id === activeWbTabId);

  const handleNavigateCurrentTab = (sectionType: WbTabType) => {
    if (activeWbTabId) {
      const label = TAB_TYPE_ICONS[sectionType]?.label || sectionType;
      setWbTabs(prev => prev.map(t =>
        t.id === activeWbTabId
          ? { ...t, type: sectionType, title: label, entityId: undefined, mapId: undefined }
          : t
      ));
      setActiveSection(sectionType as ActiveSection);
      setSelectedEntityId(null);
    } else {
      const tabId = makeTabId();
      const label = TAB_TYPE_ICONS[sectionType]?.label || sectionType;
      setWbTabs(prev => [...prev, { id: tabId, type: sectionType, title: label }]);
      setActiveWbTabId(tabId);
      setActiveSection(sectionType as ActiveSection);
    }
  };

  const handleAddNewTab = () => {
    const tabId = makeTabId();
    setWbTabs(prev => [...prev, { id: tabId, type: "home", title: "Home" }]);
    setActiveWbTabId(tabId);
    setActiveSection("home");
  };

  const handleOpenEntityInCurrentTab = (entityId: string, entityName: string) => {
    if (activeWbTabId) {
      setWbTabs(prev => prev.map(t =>
        t.id === activeWbTabId
          ? { ...t, type: "article", title: entityName, entityId }
          : t
      ));
      setSelectedEntityId(entityId);
      setActiveSection("encyclopedia");
    } else {
      const tabId = makeTabId();
      setWbTabs(prev => [...prev, { id: tabId, type: "article", title: entityName, entityId }]);
      setActiveWbTabId(tabId);
      setSelectedEntityId(entityId);
      setActiveSection("encyclopedia");
    }
  };

  const handleOpenEntityInNewTab = (entityId: string, entityName: string) => {
    const existing = wbTabs.find(t => t.type === "article" && t.entityId === entityId);
    if (existing) {
      setActiveWbTabId(existing.id);
      setSelectedEntityId(entityId);
      return;
    }
    const tabId = makeTabId();
    setWbTabs(prev => [...prev, { id: tabId, type: "article", title: entityName, entityId }]);
    setActiveWbTabId(tabId);
    setSelectedEntityId(entityId);
    setActiveSection("encyclopedia");
  };

  const handleOpenMapEditTab = (mapId: string, mapName: string) => {
    const existing = wbTabs.find(t => t.type === "map-edit" && t.mapId === mapId);
    if (existing) {
      setActiveWbTabId(existing.id);
      return;
    }
    const tabId = makeTabId();
    const newTab: WbTab = { id: tabId, type: "map-edit", title: mapName || "Map Editor", mapId };
    setWbTabs(prev => [...prev, newTab]);
    setActiveWbTabId(tabId);
  };

  const handleCloseWbTab = (tabId: string) => {
    setWbTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId);
      const next = prev.filter(t => t.id !== tabId);
      if (activeWbTabId === tabId) {
        if (next.length === 0) {
          setActiveWbTabId(null);
        } else {
          const newIdx = Math.min(idx, next.length - 1);
          setActiveWbTabId(next[newIdx].id);
          const nt = next[newIdx];
          if (nt.type === "article" && nt.entityId) {
            setSelectedEntityId(nt.entityId);
            setActiveSection("encyclopedia");
          } else {
            setActiveSection((nt.type === "article" ? "encyclopedia" : nt.type === "map-edit" ? "maps" : nt.type) as ActiveSection);
          }
        }
      }
      return next;
    });
  };

  const handleSwitchWbTab = (tabId: string) => {
    setActiveWbTabId(tabId);
    const tab = wbTabs.find(t => t.id === tabId);
    if (tab) {
      if (tab.type === "article" && tab.entityId) {
        setSelectedEntityId(tab.entityId);
        setActiveSection("encyclopedia");
      } else if (tab.type === "map-edit") {
        setEditingMapId(tab.mapId || null);
      } else {
        setActiveSection((tab.type === "article" ? "encyclopedia" : tab.type === "map-edit" ? "maps" : tab.type) as ActiveSection);
        if (tab.type === "timeline" && tab.selectedTimelineId !== undefined) {
          setSelectedTimelineId(tab.selectedTimelineId || null);
        }
      }
    }
  };

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
    mutationFn: async (data: { name: string; description?: string; homeContent?: string; customTags?: string[]; system?: string }) => {
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
      setWbTabs(prev => prev.filter(t => !(t.type === "article" && t.entityId === deleteEntityConfirm)));
      toast({ title: "Entity deleted" });
    } catch {
      toast({ title: "Failed to delete entity", variant: "destructive" });
    }
    setDeleteEntityConfirm(null);
  };

  const handleDeleteTimeline = async (timelineId: string) => {
    try {
      await deleteTimelineMutation.mutateAsync(timelineId);
      if (selectedTimelineId === timelineId) {
        setSelectedTimelineId(null);
      }
      toast({ title: "Timeline deleted" });
    } catch {
      toast({ title: "Failed to delete timeline", variant: "destructive" });
    }
  };

  const handleContextMenu = useCallback((e: React.MouseEvent, type: "entity" | "timeline", id: string, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type, id, name });
  }, []);

  const handleContextMenuAction = useCallback((action: "edit" | "delete") => {
    if (!contextMenu) return;
    const { type, id, name } = contextMenu;
    setContextMenu(null);
    if (action === "edit") {
      if (type === "entity") {
        handleOpenEntityInCurrentTab(id, name);
      } else if (type === "timeline") {
        setSelectedTimelineId(id);
        handleNavigateCurrentTab("timeline");
      }
    } else if (action === "delete") {
      if (type === "entity") {
        setDeleteEntityConfirm(id);
      } else if (type === "timeline") {
        handleDeleteTimeline(id);
      }
    }
  }, [contextMenu]);

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

  const handleSelectEntity = (entityId: string, e?: React.MouseEvent) => {
    if (selectedEntityId) {
      setEntityHistory(prev => [...prev.slice(-20), selectedEntityId]);
    }
    const entity = entities.find((ent: any) => ent.id === entityId);
    const name = entity?.displayName || "Article";
    const ctrlClick = e && (e.ctrlKey || e.metaKey);
    if (ctrlClick) {
      handleOpenEntityInNewTab(entityId, name);
    } else {
      handleOpenEntityInCurrentTab(entityId, name);
    }
    if (isMobile) {
      setMobileSidebarOpen(false);
    }
  };

  const handleWikiLinkClick = (type: string, id: string) => {
    switch (type) {
      case "entity":
        handleSelectEntity(id);
        break;
      case "map":
        setActiveSection("maps");
        setEditingMapId(id);
        break;
      case "character":
      case "item":
      case "spell":
        setWikiLinkPreview({ type, id });
        break;
      default:
        break;
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
      setEditCustomTags((selectedWorld.customTags as string[]) || []);
      setEditWorldSystem(selectedWorld.system || "arcana-adventure");
      setNewCustomTag("");
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
            <Select value={selectedWorldId} onValueChange={(val) => { setSelectedWorldId(val); setSelectedEntityId(null); setWbTabs([]); setActiveWbTabId(null); }}>
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
        {SECTION_CONFIG.map(({ key, label, icon: Icon }) => {
          const isActiveSection = activeTab?.type === key ||
            (key === "encyclopedia" && activeTab?.type === "article") ||
            (key === "maps" && activeTab?.type === "map-edit");
          return (
            <button
              key={key}
              onClick={() => {
                handleNavigateCurrentTab(key as WbTabType);
                if (key === "home" && selectedWorld) {
                  setEditWorldName(selectedWorld.name);
                  setEditWorldDescription(selectedWorld.description || "");
                }
                if (isMobile && key !== "encyclopedia" && key !== "timeline") setMobileSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs transition-colors mb-0.5 ${
                isActiveSection
                  ? 'bg-amber-500/10 text-amber-400 border-l-2 border-amber-400'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/50'
              }`}
              data-testid={`nav-section-${key}`}
            >
              <Icon className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="font-medium">{label}</span>
            </button>
          );
        })}
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
              {Object.entries(tagCounts).sort(([, a], [, b]) => b - a).map(([tag, count]) => (
                <Badge
                  key={tag}
                  variant={filterType === tag ? "default" : "outline"}
                  className={`text-[8px] cursor-pointer px-1 py-0 ${filterType === tag ? "text-white" : "border-stone-700 text-stone-500 hover:text-stone-300"}`}
                  style={filterType === tag ? { backgroundColor: (TAG_COLORS[tag] || "#78909c") + "33", color: TAG_COLORS[tag] || "#78909c", borderColor: (TAG_COLORS[tag] || "#78909c") + "55" } : {}}
                  onClick={() => setFilterType(filterType === tag ? "" : tag)}
                >
                  {tag} ({count})
                </Badge>
              ))}
            </div>
          </div>

          <ScrollArea className="flex-1">
            {!searchQuery && !filterType && recentEntities.length > 0 && (
              <div className="px-2 py-1.5 border-b border-stone-800">
                <h3 className="text-[9px] font-medium text-stone-500 uppercase tracking-wider mb-1">Recently Edited</h3>
                {recentEntities.slice(0, 5).map(e => {
                  const cfg = ENTITY_TYPE_CONFIG[e.entityType];
                  const IconComp = cfg ? ICON_MAP[cfg.icon] || FileText : FileText;
                  return (
                    <button
                      key={e.id}
                      onClick={() => handleSelectEntity(e.id)}
                      className={`w-full text-left px-2 py-1 rounded text-[11px] flex items-center gap-2 transition-colors ${selectedEntityId === e.id ? 'bg-stone-800 text-amber-400' : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/50'}`}
                      data-testid={`recent-entity-${e.id}`}
                    >
                      <IconComp className="h-3 w-3 flex-shrink-0" style={{ color: cfg?.color || "#78909c" }} />
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
                  const IconComp = cfg ? ICON_MAP[cfg.icon] || FileText : FileText;
                  const entityTags = (entity.tags as string[]) || [];
                  return (
                    <button
                      key={entity.id}
                      onClick={() => handleSelectEntity(entity.id)}
                      onContextMenu={(e) => handleContextMenu(e, "entity", entity.id, entity.displayName)}
                      className={`w-full text-left px-2 py-1.5 rounded-md transition-colors group flex items-center gap-2 ${
                        selectedEntityId === entity.id
                          ? 'bg-stone-800 border-l-2 border-amber-400'
                          : 'hover:bg-stone-800/60'
                      }`}
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
                        {entityTags.length > 0 && (
                          <div className="flex flex-wrap gap-0.5 mt-0.5">
                            {entityTags.slice(0, 2).map(tag => (
                              <span key={tag} className="text-[7px] px-0.5 rounded" style={{ color: TAG_COLORS[tag] || "#78909c", backgroundColor: (TAG_COLORS[tag] || "#78909c") + "15" }}>
                                {tag}
                              </span>
                            ))}
                            {entityTags.length > 2 && <span className="text-[7px] text-stone-500">+{entityTags.length - 2}</span>}
                          </div>
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
                      onContextMenu={(e) => handleContextMenu(e, "timeline", tl.id, tl.name)}
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
            {selectedWorldId && activeTab && (
              <div className="flex items-center">
                <Badge variant="outline" className="text-[10px] border-stone-700 text-stone-400 px-1.5 py-0">
                  {activeTab.type === "article" ? activeTab.title : (TAB_TYPE_ICONS[activeTab.type]?.label || activeTab.title)}
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
                  {SECTION_CONFIG.map(({ key, icon: Icon }) => {
                    const isActiveSection = activeTab?.type === key ||
                      (key === "encyclopedia" && activeTab?.type === "article") ||
                      (key === "maps" && activeTab?.type === "map-edit");
                    return (
                      <Button
                        key={key}
                        variant="ghost"
                        size="icon"
                        className={`h-8 w-8 ${isActiveSection ? 'text-amber-400' : 'text-stone-500 hover:text-stone-300'}`}
                        onClick={() => { handleNavigateCurrentTab(key as WbTabType); if (key === "home" && selectedWorld) { setEditWorldName(selectedWorld.name); setEditWorldDescription(selectedWorld.description || ""); } }}
                        data-testid={`nav-section-collapsed-${key}`}
                      >
                        <Icon className="h-4 w-4" />
                      </Button>
                    );
                  })}
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
            <div className="border-b border-stone-700 bg-stone-900/80 shrink-0 min-h-[30px]">
              <div className="flex items-center overflow-x-auto">
                {wbTabs.length === 0 && (
                  <span className="text-[10px] text-stone-600 px-3 py-1.5 italic">No tabs open</span>
                )}
                {wbTabs.map((tab) => {
                  const isActive = tab.id === activeWbTabId;
                  const tabMeta = TAB_TYPE_ICONS[tab.type] || TAB_TYPE_ICONS.article;
                  const TabIcon = tabMeta.icon;
                  return (
                    <div
                      key={tab.id}
                      role="tab"
                      tabIndex={0}
                      onClick={() => handleSwitchWbTab(tab.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSwitchWbTab(tab.id); }}}
                      className={`group flex items-center gap-1.5 px-3 py-1.5 flex-shrink-0 text-xs max-w-[200px] border-r border-stone-800 cursor-pointer select-none ${
                        isActive
                          ? "bg-stone-800 text-amber-400 border-b-2 border-b-amber-500"
                          : "bg-stone-900/50 text-stone-400 hover:bg-stone-800/70 hover:text-stone-300 border-b-2 border-b-transparent"
                      } transition-all duration-150`}
                      data-testid={`wb-tab-${tab.id}`}
                    >
                      <TabIcon className={`flex-shrink-0 h-3 w-3 ${isActive ? 'text-amber-400' : 'text-stone-500'}`} />
                      <span className="truncate flex-1 text-left">{tab.title || tabMeta.label}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCloseWbTab(tab.id);
                        }}
                        className={`flex-shrink-0 p-0.5 rounded hover:bg-stone-700 transition-colors ${
                          isActive ? 'text-stone-400 hover:text-stone-200' : 'text-stone-500 hover:text-stone-300 opacity-0 group-hover:opacity-100'
                        }`}
                        data-testid={`wb-tab-close-${tab.id}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
                <button
                  onClick={handleAddNewTab}
                  className="flex-shrink-0 p-1.5 text-stone-500 hover:text-amber-400 hover:bg-stone-800 rounded transition-colors mx-0.5"
                  title="Open new tab"
                  data-testid="wb-tab-add"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {activeSection === "home" && selectedWorldId && selectedWorld && (
              <div className="flex-1 overflow-y-auto bg-[#0c0a09]">
                <div className="sticky top-0 z-20 bg-[#0c0a09]/95 backdrop-blur-md border-b border-stone-800/60 px-4 md:px-8 py-2.5">
                  <div className="flex items-center justify-between max-w-4xl mx-auto">
                    <div className="flex items-center gap-2.5">
                      <Home className="h-4 w-4 text-amber-400" />
                      <span className="text-sm font-semibold text-stone-200">Home Page</span>
                      {homeContentDirty && (
                        <span className="text-[10px] text-amber-400/80 font-medium flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          Unsaved
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center bg-stone-800/60 rounded-lg border border-stone-700/50 p-0.5">
                        <button
                          onClick={() => setHomeEditorMode("preview")}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                            homeEditorMode === "preview"
                              ? "bg-amber-500/15 text-amber-300 shadow-sm"
                              : "text-stone-400 hover:text-stone-200"
                          }`}
                          data-testid="button-home-preview"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Preview
                        </button>
                        <button
                          onClick={() => setHomeEditorMode("edit")}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                            homeEditorMode === "edit"
                              ? "bg-amber-500/15 text-amber-300 shadow-sm"
                              : "text-stone-400 hover:text-stone-200"
                          }`}
                          data-testid="button-home-edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                      </div>
                      {homeEditorMode === "edit" && (
                        <Button
                          size="sm"
                          onClick={() => {
                            updateWorldMutation.mutate({
                              name: editWorldName.trim(),
                              description: editWorldDescription.trim() || undefined,
                              homeContent: homeContentDraft,
                            });
                            setHomeContentDirty(false);
                          }}
                          disabled={!editWorldName.trim() || updateWorldMutation.isPending}
                          className="bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white text-xs h-8 px-4 shadow-lg shadow-amber-500/20"
                          data-testid="button-save-home-content"
                        >
                          {updateWorldMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                          ) : (
                            <Save className="h-3 w-3 mr-1.5" />
                          )}
                          {updateWorldMutation.isPending ? "Saving..." : "Save"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {homeEditorMode === "preview" && (
                  <div data-testid="home-preview">
                    <div className="relative w-full" style={{ minHeight: selectedWorld.image ? '300px' : '180px' }}>
                      {selectedWorld.image ? (
                        <>
                          <img src={selectedWorld.image} alt={editWorldName} className="absolute inset-0 w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-[#0c0a09]" />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#0c0a09] via-transparent to-transparent" />
                        </>
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-b from-amber-950/20 via-stone-950 to-[#0c0a09]" />
                      )}
                      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#0c0a09] to-transparent" />
                      <div className="relative z-10 flex flex-col items-center justify-end h-full pb-8 pt-16 px-4 text-center">
                        <div className="mb-3 flex items-center gap-2">
                          <div className="h-px w-12 bg-gradient-to-r from-transparent to-amber-500/60" />
                          <Globe className="h-5 w-5 text-amber-400/80" />
                          <div className="h-px w-12 bg-gradient-to-l from-transparent to-amber-500/60" />
                        </div>
                        <h1 className="text-3xl md:text-5xl font-bold text-white tracking-tight" style={{ textShadow: '0 2px 20px rgba(0,0,0,0.8)' }}>
                          {editWorldName || "Untitled World"}
                        </h1>
                        {editWorldDescription && (
                          <p className="mt-4 max-w-2xl text-base md:text-lg text-stone-300/90 italic leading-relaxed" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}>
                            "{editWorldDescription}"
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="relative z-10 -mt-4">
                      <div className="flex justify-center gap-3 md:gap-6 px-4 flex-wrap">
                        {entities.length > 0 && (
                          <div className="flex items-center gap-2 text-stone-400">
                            <BookOpen className="h-3.5 w-3.5 text-amber-500/70" />
                            <span className="text-xs font-medium">{entities.length} Articles</span>
                          </div>
                        )}
                      </div>
                      <div className="flex justify-center my-6">
                        <div className="flex items-center gap-3">
                          <div className="h-px w-16 bg-gradient-to-r from-transparent to-amber-500/40" />
                          <div className="w-1.5 h-1.5 rotate-45 bg-amber-500/50" />
                          <div className="h-px w-16 bg-gradient-to-l from-transparent to-amber-500/40" />
                        </div>
                      </div>
                    </div>

                    <div className="max-w-4xl mx-auto px-4 md:px-8 pb-12">
                      {homeContentDraft ? (
                        <div className="mb-12">
                          <div className="bg-stone-900/40 rounded-xl border border-stone-800/60 p-6 md:p-10 backdrop-blur-sm shadow-xl shadow-black/20">
                            {renderHomeContent(homeContentDraft)}
                          </div>
                        </div>
                      ) : (
                        <div className="mb-12">
                          <div className="bg-stone-900/40 rounded-xl border border-stone-800/60 border-dashed p-10 text-center">
                            <FileText className="h-10 w-10 text-stone-700 mx-auto mb-3" />
                            <p className="text-stone-500 text-sm">No home page content yet. Switch to Edit to add content.</p>
                          </div>
                        </div>
                      )}

                      {entities.length > 0 && (
                        <div className="mb-12">
                          <div className="flex items-center gap-4 mb-5">
                            <div className="h-px flex-1 bg-gradient-to-r from-amber-500/30 to-transparent" />
                            <h3 className="text-sm font-bold text-amber-400/80 uppercase tracking-[0.2em]">Explore This World</h3>
                            <div className="h-px flex-1 bg-gradient-to-l from-amber-500/30 to-transparent" />
                          </div>
                          <div className="flex flex-wrap justify-center gap-2">
                            {Object.entries(tagCounts).sort(([, a], [, b]) => b - a).slice(0, 8).map(([tag, count]) => (
                              <button
                                key={tag}
                                onClick={() => { setActiveSection("encyclopedia"); setFilterType(tag); }}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-stone-900/50 border border-stone-800/50 hover:border-stone-700 transition-colors"
                              >
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TAG_COLORS[tag] || "#78909c" }} />
                                <span className="text-sm font-medium text-stone-200">{tag}</span>
                                <span className="text-xs text-stone-500">{count}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="text-center py-8 border-t border-stone-800/40">
                        <div className="flex justify-center mb-3">
                          <div className="flex items-center gap-2">
                            <div className="h-px w-8 bg-amber-500/30" />
                            <Globe className="h-4 w-4 text-amber-500/40" />
                            <div className="h-px w-8 bg-amber-500/30" />
                          </div>
                        </div>
                        <p className="text-[11px] text-stone-600">{editWorldName || "Untitled World"}</p>
                      </div>
                    </div>
                  </div>
                )}

                {homeEditorMode === "edit" && (
                  <div className="max-w-4xl mx-auto p-4 md:p-8" data-testid="home-editor">
                    <div className="space-y-6">
                      <div className="bg-stone-900/50 rounded-xl border border-stone-800/60 p-5 space-y-5">
                        <div className="flex items-center gap-2 mb-1">
                          <Globe className="h-4 w-4 text-amber-400/70" />
                          <h3 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">World Identity</h3>
                        </div>

                        <div>
                          <Label className="text-xs text-stone-400 font-medium">World Name</Label>
                          <Input
                            value={editWorldName}
                            onChange={(e) => setEditWorldName(e.target.value)}
                            placeholder="The name of your world..."
                            className="mt-1.5 bg-stone-800/80 border-stone-700/50 text-stone-100 text-base font-semibold h-11 focus:border-amber-500/40 focus:ring-amber-500/20"
                            data-testid="input-home-world-name"
                          />
                        </div>

                        <div>
                          <Label className="text-xs text-stone-400 font-medium">Description / Lore Blurb</Label>
                          <Textarea
                            value={editWorldDescription}
                            onChange={(e) => setEditWorldDescription(e.target.value)}
                            placeholder="A short description or lore blurb shown beneath the world name on the landing page..."
                            className="mt-1.5 bg-stone-800/80 border-stone-700/50 text-stone-200 min-h-[80px] italic focus:border-amber-500/40 focus:ring-amber-500/20"
                            data-testid="input-home-world-description"
                          />
                          <p className="text-[10px] text-stone-600 mt-1.5">Displayed as an italicized quote beneath your world's title on the landing page.</p>
                        </div>
                      </div>

                      <div className="bg-stone-900/50 rounded-xl border border-stone-800/60 p-5">
                        <div className="flex items-center gap-2 mb-4">
                          <FileText className="h-4 w-4 text-amber-400/70" />
                          <h3 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Home Page Content</h3>
                        </div>

                        <Textarea
                          value={homeContentDraft}
                          onChange={(e) => { setHomeContentDraft(e.target.value); setHomeContentDirty(true); }}
                          placeholder={"Write the main article content for your world's home page.\n\nSupported formatting:\n# Heading 1\n## Heading 2\n### Heading 3\n**bold text**\n*italic text*\n- list items\n--- horizontal divider"}
                          className="bg-stone-800/80 border-stone-700/50 text-stone-200 min-h-[400px] font-mono text-sm leading-relaxed focus:border-amber-500/40 focus:ring-amber-500/20"
                          data-testid="input-home-content"
                        />
                        <div className="flex items-center justify-between mt-2">
                          <p className="text-[10px] text-stone-600">Use markdown for formatting. Switch to Preview to see how it looks.</p>
                          <span className="text-[10px] text-stone-600">{homeContentDraft.length} chars</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
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
                            const IconComp = cfg ? ICON_MAP[cfg.icon] || FileText : FileText;
                            return (
                              <>
                                <IconComp className="h-4 w-4 flex-shrink-0" style={{ color: cfg?.color || "#78909c" }} />
                                <Badge variant="outline" className="text-[10px] border-stone-600 text-stone-400 flex-shrink-0">{cfg?.label || "Article"}</Badge>
                              </>
                            );
                          })()}
                          {((selectedEntity.tags as string[]) || []).slice(0, 3).map(tag => (
                            <Badge key={tag} variant="outline" className="text-[9px] px-1 py-0 flex-shrink-0" style={{ borderColor: (TAG_COLORS[tag] || "#78909c") + "55", color: TAG_COLORS[tag] || "#78909c" }}>
                              {tag}
                            </Badge>
                          ))}
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
                          onWikiLinkClick={handleWikiLinkClick}
                          shareToken={shareLink?.token}
                          customTags={selectedWorld?.customTags || []}
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
                    <div className="p-4 md:p-8 max-w-4xl mx-auto w-full">
                      <div className="text-center mb-8">
                        <BookOpen className="h-10 w-10 text-amber-500/30 mx-auto mb-3" />
                        <h2 className="text-lg font-semibold text-stone-300 mb-1">Encyclopedia</h2>
                        <p className="text-stone-500 text-xs">{entities.length} article{entities.length !== 1 ? 's' : ''}</p>
                      </div>

                      {Object.keys(tagCounts).length > 0 && (
                        <div className="flex flex-wrap justify-center gap-1.5 mb-6">
                          {Object.entries(tagCounts).sort(([, a], [, b]) => b - a).map(([tag, count]) => (
                            <button
                              key={tag}
                              onClick={() => { setFilterType(tag); }}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-stone-700/50 bg-stone-900/50 hover:bg-stone-800/60 transition-colors"
                              data-testid={`front-tag-${tag}`}
                            >
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TAG_COLORS[tag] || "#78909c" }} />
                              <span className="text-[11px] text-stone-300">{tag}</span>
                              <span className="text-[10px] text-stone-500">{count}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {(() => {
                        const displayEntities = filterType
                          ? entities.filter(e => ((e.tags as string[]) || []).includes(filterType))
                          : entities;
                        return displayEntities.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {[...displayEntities].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).map(entity => {
                            const cfg = ENTITY_TYPE_CONFIG[entity.entityType];
                            const IconComp = cfg ? ICON_MAP[cfg.icon] || FileText : FileText;
                            const entityTags = (entity.tags as string[]) || [];
                            return (
                              <button
                                key={entity.id}
                                onClick={() => handleSelectEntity(entity.id)}
                                className="text-left p-3 rounded-lg bg-stone-900/50 border border-stone-800/50 hover:border-stone-700 hover:bg-stone-800/50 transition-all group"
                                data-testid={`front-article-${entity.id}`}
                              >
                                <div className="flex items-start gap-2.5">
                                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: (cfg?.color || "#78909c") + "15" }}>
                                    <IconComp className="h-4 w-4" style={{ color: cfg?.color || "#78909c" }} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-stone-200 group-hover:text-amber-300 truncate transition-colors">
                                      {entity.displayName}
                                    </div>
                                    {entity.description && (
                                      <div className="text-[11px] text-stone-500 line-clamp-2 mt-0.5">{entity.description}</div>
                                    )}
                                    {entityTags.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1.5">
                                        {entityTags.slice(0, 3).map(tag => (
                                          <span key={tag} className="text-[9px] px-1.5 py-0 rounded-full" style={{ color: TAG_COLORS[tag] || "#78909c", backgroundColor: (TAG_COLORS[tag] || "#78909c") + "15" }}>
                                            {tag}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <p className="text-stone-600 text-sm">{filterType ? `No articles tagged "${filterType}".` : "No articles yet. Create one to start building your encyclopedia."}</p>
                        </div>
                      );
                      })()}
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
                    onBack={() => {
                      setEditingMapId(null);
                      setCreatingMap(false);
                      if (activeTab?.type === "map-edit") {
                        handleCloseWbTab(activeTab.id);
                      }
                    }}
                    onMapCreated={(newId) => {
                      setCreatingMap(false);
                      setEditingMapId(newId);
                      handleOpenMapEditTab(newId, "New Map");
                    }}
                  />
                ) : (
                  <WorldMapViewer
                    worldId={selectedWorldId}
                    isGM={true}
                    onEditMap={(mapId) => {
                      setEditingMapId(mapId);
                      handleOpenMapEditTab(mapId, "Map Editor");
                    }}
                    onCreateMap={() => setCreatingMap(true)}
                    onNavigateToEntity={(entityId) => {
                      handleSelectEntity(entityId);
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

            {activeSection === "graph" && selectedWorldId && (
              <div className="flex-1">
                <RelationshipGraph
                  worldId={selectedWorldId}
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
          onEntityCreated={(id, name) => { setShowCreateInline(false); handleOpenEntityInCurrentTab(id, name); }}
          createOnly={true}
          onCloseCreate={() => setShowCreateInline(false)}
          customTags={(selectedWorld?.customTags as string[]) || []}
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
            <div>
              <Label className="text-xs text-stone-400">Game System</Label>
              <select
                value={editWorldSystem}
                onChange={(e) => setEditWorldSystem(e.target.value)}
                className="w-full mt-1 bg-stone-800 border border-stone-700 rounded-md text-stone-200 text-sm px-3 py-2"
                data-testid="select-world-system"
              >
                <option value="arcana-adventure">Arcana Adventure</option>
                <option value="aa-v2">AA V2</option>
              </select>
            </div>
            <div>
              <Label className="text-xs text-stone-400">Custom Tags</Label>
              <p className="text-[10px] text-stone-500 mt-0.5 mb-1.5">Add custom tags beyond the 25 built-in ones. These will be available when tagging articles in this world.</p>
              <div className="flex gap-1.5 mb-2">
                <Input
                  value={newCustomTag}
                  onChange={(e) => setNewCustomTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newCustomTag.trim()) {
                      e.preventDefault();
                      const tag = newCustomTag.trim();
                      if (!editCustomTags.includes(tag)) setEditCustomTags([...editCustomTags, tag]);
                      setNewCustomTag("");
                    }
                  }}
                  placeholder="New tag name..."
                  className="bg-stone-800 border-stone-700 text-stone-200 text-xs h-7"
                  data-testid="input-new-custom-tag"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="border-stone-700 text-stone-300 h-7 px-2 text-xs"
                  onClick={() => {
                    const tag = newCustomTag.trim();
                    if (tag && !editCustomTags.includes(tag)) setEditCustomTags([...editCustomTags, tag]);
                    setNewCustomTag("");
                  }}
                  disabled={!newCustomTag.trim()}
                  data-testid="button-add-custom-tag"
                >
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              {editCustomTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {editCustomTags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-violet-500/15 text-violet-300 border border-violet-500/30">
                      {tag}
                      <button onClick={() => setEditCustomTags(editCustomTags.filter(t => t !== tag))} className="hover:text-red-400 transition-colors" data-testid={`button-remove-tag-${tag}`}>
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
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
                onClick={() => updateWorldMutation.mutate({ name: editWorldName.trim(), description: editWorldDescription.trim() || undefined, customTags: editCustomTags, system: editWorldSystem })}
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

      {wikiLinkPreview && selectedWorldId && (
        <WikiLinkPreviewDialog
          type={wikiLinkPreview.type}
          id={wikiLinkPreview.id}
          worldId={selectedWorldId}
          onClose={() => setWikiLinkPreview(null)}
        />
      )}

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-[9999] min-w-[160px] bg-stone-800 border border-stone-600 rounded-lg shadow-xl py-1 animate-in fade-in-0 zoom-in-95"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          data-testid="wb-context-menu"
        >
          <div className="px-3 py-1.5 text-[10px] text-stone-500 font-medium truncate border-b border-stone-700 mb-0.5">
            {contextMenu.name}
          </div>
          <button
            onClick={() => handleContextMenuAction("edit")}
            className="w-full text-left px-3 py-1.5 text-xs text-stone-200 hover:bg-stone-700 flex items-center gap-2 transition-colors"
            data-testid="context-menu-edit"
          >
            <Pencil className="h-3 w-3 text-stone-400" />
            Open & Edit
          </button>
          <button
            onClick={() => handleContextMenuAction("delete")}
            className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition-colors"
            data-testid="context-menu-delete"
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function WikiLinkPreviewDialog({ type, id, worldId, onClose }: { type: string; id: string; worldId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ name: string; description?: string; details?: Record<string, string | number | null> }>({
    queryKey: ["/api/worlds", worldId, "wiki-link-preview", type, id],
    queryFn: async () => {
      const res = await fetch(`/api/worlds/${worldId}/wiki-link-preview/${type}/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load preview");
      return res.json();
    },
  });

  const typeLabels: Record<string, string> = { character: "Character", item: "Item", spell: "Spell" };
  const typeColors: Record<string, string> = { character: "text-blue-400", item: "text-orange-400", spell: "text-purple-400" };
  const typeIcons: Record<string, React.ReactNode> = {
    character: <User className="h-5 w-5" />,
    item: <Package className="h-5 w-5" />,
    spell: <Sparkles className="h-5 w-5" />,
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 max-w-md" data-testid="dialog-wiki-link-preview">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-stone-100">
            <span className={typeColors[type] || "text-stone-400"}>{typeIcons[type]}</span>
            {isLoading ? "Loading..." : data?.name || "Unknown"}
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-stone-500" />
          </div>
        ) : data ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-800 border border-stone-700 text-stone-400">{typeLabels[type] || type}</span>
            </div>
            {data.description && (
              <p className="text-sm text-stone-400">{data.description}</p>
            )}
            {data.details && Object.keys(data.details).length > 0 && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs border-t border-stone-800 pt-3">
                {Object.entries(data.details).map(([key, value]) => value != null ? (
                  <div key={key} className="flex justify-between col-span-1">
                    <span className="text-stone-500 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span className="text-stone-300">{String(value)}</span>
                  </div>
                ) : null)}
              </div>
            )}
          </div>
        ) : (
          <p className="text-stone-500 text-sm">Could not load preview.</p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-stone-400" data-testid="button-close-wiki-preview">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
