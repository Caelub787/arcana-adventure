import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { LoadingLogo } from "@/components/LoadingLogo";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Globe, BookOpen, Map, Clock, Calendar, Network, Search, MapPin, User, Shield, Scroll, Package, Swords, Sparkles, FileText, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, ZoomIn, ZoomOut, Maximize2, Navigation, Link2, X, Eye, Home, Layout } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const ENTITY_TYPE_CONFIG: Record<string, { label: string; pluralLabel: string; color: string; icon: string }> = {
  article: { label: "Article", pluralLabel: "Articles", color: "#fff176", icon: "FileText" },
  canvas: { label: "Canvas", pluralLabel: "Canvas Articles", color: "#90caf9", icon: "Layout" },
};

const TAG_COLORS: Record<string, string> = {
  "Building/Landmark": "#a1887f",
  "Character": "#e57373",
  "God/Deity": "#ce93d8",
  "Condition": "#ef9a9a",
  "Conflict": "#ef5350",
  "Article": "#fff176",
  "Ethnicity/Species": "#ffcc80",
  "Geographic Location": "#81c784",
  "Item": "#4db6ac",
  "Language": "#90a4ae",
  "Material": "#bcaaa4",
  "Military": "#e57373",
  "Myth/Legend": "#ba68c8",
  "Natural Law": "#80cbc4",
  "Organization": "#64b5f6",
  "Faction/Sect": "#7986cb",
  "Plot": "#ffb74d",
  "Profession": "#a5d6a7",
  "Session Report": "#b0bec5",
  "Settlement": "#81c784",
  "Spell": "#ba68c8",
  "Technology": "#90a4ae",
  "Title/Rank": "#ce93d8",
  "Tradition/Ritual": "#f48fb1",
  "Religions/Cults": "#7e57c2",
  "Vehicle": "#78909c",
};

const ICON_MAP: Record<string, React.ElementType> = {
  User, MapPin, Shield, Scroll, Calendar, BookOpen, Package, Swords, Search, Sparkles, Clock, FileText, Layout,
};

const ERA_COLORS: Record<string, string> = {
  "Ancient": "#90a4ae",
  "Classical": "#a1887f",
  "Medieval": "#81c784",
  "Renaissance": "#64b5f6",
  "Modern": "#ce93d8",
  "Future": "#4db6ac",
};

interface SharedEntity {
  id: string;
  entityType: string;
  displayName: string;
  description?: string | null;
  image?: string | null;
  visibility: string;
  articleContent?: string | null;
  loreFields?: Record<string, any> | null;
  tags?: string[] | null;
}

interface SharedEntityLink {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  linkType: string;
  label?: string | null;
}

interface SharedWorldMap {
  id: string;
  title: string;
  imageUrl?: string | null;
  description?: string | null;
  parentMapId?: string | null;
  visibility: string;
}

interface SharedWorldMapPin {
  id: string;
  mapId: string;
  x: number;
  y: number;
  label?: string | null;
  icon?: string | null;
  color?: string | null;
  pinType: string;
  textContent?: string | null;
  targetMapId?: string | null;
  targetEntityId?: string | null;
}

interface SharedTimelineEvent {
  id: string;
  title: string;
  description?: string | null;
  date?: string | null;
  endDate?: string | null;
  era?: string | null;
  entityId?: string | null;
  calendarId?: string | null;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number | null;
  visibility: string;
}

interface SharedCalendar {
  id: string;
  name: string;
  monthNames: string[];
  daysPerMonth: number[];
  weekDayNames: string[];
  currentYear?: number | null;
  currentMonth?: number | null;
  currentDay?: number | null;
  yearSuffix?: string | null;
  notes?: Record<string, any> | null;
}

interface SharedTimeline {
  id: string;
  name: string;
  eras: { name: string; description?: string; color?: string }[];
  color?: string | null;
  sortOrder?: number | null;
}

interface SharedWorldData {
  campaignName: string;
  worldImage?: string | null;
  worldDescription?: string | null;
  homeContent?: string | null;
  entities: SharedEntity[];
  entityLinks: SharedEntityLink[];
  maps: SharedWorldMap[];
  mapPins: Record<string, SharedWorldMapPin[]>;
  calendars: SharedCalendar[];
  timelineEvents: SharedTimelineEvent[];
  timelines?: SharedTimeline[];
}

type ActiveSection = "home" | "encyclopedia" | "maps" | "timeline" | "calendar";

const SECTION_CONFIG: { key: ActiveSection; label: string; icon: React.ElementType }[] = [
  { key: "home", label: "Home", icon: Home },
  { key: "encyclopedia", label: "Encyclopedia", icon: BookOpen },
  { key: "maps", label: "Maps", icon: Map },
  { key: "timeline", label: "Timeline", icon: Clock },
  { key: "calendar", label: "Calendar", icon: Calendar },
];

function renderMarkdownPreview(content: string): string {
  if (!content) return '';
  let html = content
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold text-stone-200 mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold text-stone-200 mt-5 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-stone-100 mt-6 mb-3">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-stone-200 font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="text-stone-300 italic">$1</em>')
    .replace(/\[\[([^:\]]+):([^\|\]]+)\|([^\]]+)\]\]/g, '<span class="text-amber-400 bg-amber-900/20 px-1 rounded cursor-pointer hover:underline font-medium" data-wiki-type="$1" data-wiki-id="$2">$3</span>')
    .replace(/\[\[(.+?)\]\]/g, '<span class="text-amber-400 bg-amber-900/20 px-1 rounded cursor-pointer hover:underline">$1</span>')
    .replace(/^- (.+)$/gm, '<li class="text-stone-300 ml-4 list-disc">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="text-stone-300 ml-4 list-decimal">$1</li>')
    .replace(/^---$/gm, '<div class="my-6 flex items-center gap-3"><div class="flex-1 h-px" style="background:linear-gradient(to right,transparent,rgba(245,158,11,0.3),transparent)"></div></div>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-amber-400 hover:underline" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/^(?!<[hdhlu]|<li|<hr|<p|<div)(.+)$/gm, '<p class="text-stone-300 mb-2 leading-relaxed">$1</p>');
  return html;
}

function SharedArticlePreview({ content, entities, onEntityClick }: { content: string; entities: SharedEntity[]; onEntityClick?: (entityId: string) => void }) {
  if (!content) return <p className="text-stone-500 italic">No content.</p>;

  const wikiLinkRegex = /\[\[([^:\]]+):([^\|\]]+)\|([^\]]+)\]\]/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  while ((match = wikiLinkRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const plainSegment = content.slice(lastIndex, match.index);
      parts.push(
        <span key={`plain-${lastIndex}`} dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(plainSegment) }} />
      );
    }
    const [, refType, refId, refLabel] = match;
    const colorMap: Record<string, string> = {
      entity: "text-amber-400 hover:text-amber-300",
      map: "text-emerald-400 hover:text-emerald-300",
      character: "text-blue-400 hover:text-blue-300",
      item: "text-orange-400 hover:text-orange-300",
      spell: "text-purple-400 hover:text-purple-300",
    };
    const linkedEntity = entities.find(e => e.id === refId);
    parts.push(
      <span
        key={`ref-${match.index}`}
        className={`${colorMap[refType] || "text-amber-400 hover:text-amber-300"} cursor-pointer font-medium bg-stone-800/50 px-1 rounded hover:underline`}
        onClick={() => linkedEntity && onEntityClick?.(refId)}
        data-testid={`wiki-link-${refType}-${refId}`}
      >
        {refLabel}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push(
      <span key={`plain-end`} dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(content.slice(lastIndex)) }} />
    );
  }

  if (parts.length === 0) {
    return (
      <div
        className="prose prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(content) }}
        data-testid="article-preview"
      />
    );
  }

  return <div className="prose prose-invert max-w-none" data-testid="article-preview">{parts}</div>;
}

function CanvasReadOnlyView({ content }: { content: string }) {
  let nodes: Array<{ id: string; type: string; x: number; y: number; width: number; height: number; content: string; color?: string; shapeType?: string }> = [];
  try { nodes = JSON.parse(content); } catch { return <p className="text-stone-500 italic text-sm">Unable to render canvas content.</p>; }
  if (!Array.isArray(nodes) || nodes.length === 0) return <p className="text-stone-500 italic text-sm">Empty canvas.</p>;
  const maxX = Math.max(...nodes.map(n => n.x + n.width)) + 20;
  const maxY = Math.max(...nodes.map(n => n.y + n.height)) + 20;
  return (
    <div className="relative bg-stone-950 rounded-lg border border-stone-800 overflow-auto" style={{ minHeight: Math.min(maxY, 600), height: maxY }} data-testid="canvas-readonly-view">
      {nodes.map(node => (
        <div key={node.id} className="absolute" style={{ left: node.x, top: node.y, width: node.width, height: node.type === "text" || node.type === "heading" ? "auto" : node.height, minHeight: node.height }}>
          {node.type === "text" && <div className="p-2 text-sm text-stone-300 whitespace-pre-wrap">{node.content}</div>}
          {node.type === "heading" && <h2 className="text-lg font-bold text-stone-100 p-1">{node.content}</h2>}
          {node.type === "image" && node.content && <img src={node.content} alt="" className="w-full h-full object-cover rounded" />}
          {node.type === "shape" && <div className={`w-full h-full ${node.shapeType === "ellipse" ? "rounded-full" : "rounded"}`} style={{ backgroundColor: (node.color || "#64748b") + "30", border: `2px solid ${node.color || "#64748b"}` }} />}
        </div>
      ))}
    </div>
  );
}

function SharedMapViewer({ maps, mapPins, entities, onNavigateToEntity }: {
  maps: SharedWorldMap[];
  mapPins: Record<string, SharedWorldMapPin[]>;
  entities: SharedEntity[];
  onNavigateToEntity: (entityId: string) => void;
}) {
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [mapHistory, setMapHistory] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [activePin, setActivePin] = useState<SharedWorldMapPin | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const rootMaps = maps.filter(m => !m.parentMapId);
  const selectedMap = maps.find(m => m.id === selectedMapId);
  const pins = selectedMapId ? (mapPins[selectedMapId] || []) : [];

  const handleSelectMap = (mapId: string) => {
    if (selectedMapId) setMapHistory(prev => [...prev, selectedMapId]);
    setSelectedMapId(mapId);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setActivePin(null);
  };

  const handleBack = () => {
    if (mapHistory.length > 0) {
      const prev = mapHistory[mapHistory.length - 1];
      setMapHistory(h => h.slice(0, -1));
      setSelectedMapId(prev);
    } else {
      setSelectedMapId(null);
    }
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setActivePin(null);
  };

  const getBreadcrumbs = (): SharedWorldMap[] => {
    const trail: SharedWorldMap[] = [];
    let current = selectedMap;
    while (current) {
      trail.unshift(current);
      current = current.parentMapId ? maps.find(m => m.id === current!.parentMapId) : undefined;
    }
    return trail;
  };

  const [lastTouchDist, setLastTouchDist] = useState<number | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  };

  const handleMouseUp = () => setIsPanning(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsPanning(true);
      setPanStart({ x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y });
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      setLastTouchDist(Math.sqrt(dx * dx + dy * dy));
    }
  }, [pan.x, pan.y]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1 && isPanning) {
      setPan({ x: e.touches[0].clientX - panStart.x, y: e.touches[0].clientY - panStart.y });
    } else if (e.touches.length === 2 && lastTouchDist !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = dist / lastTouchDist;
      setZoom(z => Math.max(0.1, Math.min(5, z * scale)));
      setLastTouchDist(dist);
    }
  }, [isPanning, panStart, lastTouchDist]);

  const handleTouchEnd = useCallback(() => {
    setIsPanning(false);
    setLastTouchDist(null);
  }, []);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.1, Math.min(5, z * delta)));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.addEventListener("wheel", handleWheel, { passive: false });
      return () => el.removeEventListener("wheel", handleWheel);
    }
  }, [handleWheel]);

  useEffect(() => {
    if (!selectedMap?.imageUrl || !containerRef.current) return;
    const img = new Image();
    img.onload = () => {
      const container = containerRef.current;
      if (!container) return;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw === 0 || ch === 0) return;
      const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight, 1);
      setZoom(scale);
      setPan({
        x: (cw - img.naturalWidth * scale) / 2,
        y: (ch - img.naturalHeight * scale) / 2,
      });
    };
    img.src = selectedMap.imageUrl;
  }, [selectedMap?.id, selectedMap?.imageUrl]);

  const handlePinClick = (pin: SharedWorldMapPin) => {
    if (pin.pinType === "map_link" && pin.targetMapId) {
      handleSelectMap(pin.targetMapId);
    } else if (pin.pinType === "entity_link" && pin.targetEntityId) {
      onNavigateToEntity(pin.targetEntityId);
    } else {
      setActivePin(activePin?.id === pin.id ? null : pin);
    }
  };

  if (!selectedMap) {
    return (
      <div className="p-4 md:p-6">
        <h2 className="text-lg font-semibold text-stone-200 mb-4" data-testid="text-maps-title">World Maps</h2>
        {rootMaps.length === 0 ? (
          <div className="text-center py-12 text-stone-500">
            <Map className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No maps available</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rootMaps.map(map => (
              <button
                key={map.id}
                onClick={() => handleSelectMap(map.id)}
                className="bg-stone-900 border border-stone-800 rounded-lg overflow-hidden hover:border-amber-500/50 transition-colors text-left group"
                data-testid={`map-card-${map.id}`}
              >
                {map.imageUrl ? (
                  <div className="aspect-video bg-stone-800 overflow-hidden">
                    <img src={map.imageUrl} alt={map.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  </div>
                ) : (
                  <div className="aspect-video bg-stone-800 flex items-center justify-center">
                    <Map className="h-8 w-8 text-stone-600" />
                  </div>
                )}
                <div className="p-3">
                  <h3 className="text-sm font-medium text-stone-200 group-hover:text-amber-400 transition-colors">{map.title}</h3>
                  {map.description && <p className="text-xs text-stone-500 mt-1 line-clamp-2">{map.description}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const breadcrumbs = getBreadcrumbs();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-800 bg-stone-900/50">
        <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-400 hover:text-stone-200" onClick={handleBack} data-testid="button-map-back">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-1 text-xs text-stone-400 overflow-x-auto">
          <button onClick={() => { setSelectedMapId(null); setMapHistory([]); }} className="hover:text-amber-400">Maps</button>
          {breadcrumbs.map((m, i) => (
            <React.Fragment key={m.id}>
              <ChevronRight className="h-3 w-3 flex-shrink-0" />
              <button
                onClick={() => { setSelectedMapId(m.id); setMapHistory(mapHistory.slice(0, i)); }}
                className={`truncate max-w-[120px] ${m.id === selectedMapId ? 'text-amber-400' : 'hover:text-stone-200'}`}
              >
                {m.title}
              </button>
            </React.Fragment>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-400" onClick={() => setZoom(z => Math.min(5, z * 1.2))} data-testid="button-zoom-in">
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-400" onClick={() => setZoom(z => Math.max(0.1, z * 0.8))} data-testid="button-zoom-out">
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-400" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} data-testid="button-zoom-reset">
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative cursor-grab active:cursor-grabbing bg-stone-950"
        style={{ touchAction: "none" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
          className="relative inline-block"
        >
          {selectedMap.imageUrl ? (
            <img src={selectedMap.imageUrl} alt={selectedMap.title} className="max-w-none select-none" draggable={false} />
          ) : (
            <div className="w-[800px] h-[600px] bg-stone-900 flex items-center justify-center">
              <Map className="h-16 w-16 text-stone-700" />
            </div>
          )}
          {pins.map(pin => (
            <button
              key={pin.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 group"
              style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
              onClick={(e) => { e.stopPropagation(); handlePinClick(pin); }}
              data-testid={`map-pin-${pin.id}`}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center shadow-lg border-2 border-white/20 hover:scale-125 transition-transform"
                style={{ backgroundColor: pin.color || "#ef4444" }}
              >
                {pin.pinType === "map_link" ? <Navigation className="h-3 w-3 text-white" /> :
                 pin.pinType === "entity_link" ? <Link2 className="h-3 w-3 text-white" /> :
                 <MapPin className="h-3 w-3 text-white" />}
              </div>
              {pin.label && (
                <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 text-[10px] text-white bg-black/70 px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                  {pin.label}
                </span>
              )}
            </button>
          ))}
        </div>
        {activePin && activePin.pinType === "text_reveal" && (
          <div className="absolute top-4 right-4 w-72 bg-stone-900 border border-stone-700 rounded-lg shadow-xl p-3 z-10" data-testid="pin-text-popover">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-amber-400">{activePin.label || "Pin"}</h3>
              <Button variant="ghost" size="icon" className="h-5 w-5 text-stone-500" onClick={() => setActivePin(null)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            <p className="text-xs text-stone-300 leading-relaxed">{activePin.textContent}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SharedTimelineView({ events, entities, calendars, timelines = [], onSelectEntity }: {
  events: SharedTimelineEvent[];
  entities: SharedEntity[];
  calendars: SharedCalendar[];
  timelines?: SharedTimeline[];
  onSelectEntity: (entityId: string) => void;
}) {
  const [filterEra, setFilterEra] = useState<string>("");

  const allDefinedEras = useMemo(() => {
    const eras: { name: string; color?: string }[] = [];
    timelines.forEach(tl => {
      ((tl.eras as any[]) || []).forEach(e => {
        if (!eras.find(x => x.name === e.name)) eras.push(e);
      });
    });
    return eras;
  }, [timelines]);

  const grouped = useMemo(() => {
    let filtered = events;
    if (filterEra) filtered = filtered.filter(e => e.era === filterEra);
    const groups: Record<string, SharedTimelineEvent[]> = {};
    filtered.forEach(e => {
      const era = e.era || "Unclassified";
      if (!groups[era]) groups[era] = [];
      groups[era].push(e);
    });
    Object.values(groups).forEach(g => g.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
    const eraOrder = new Map<string, number>();
    allDefinedEras.forEach((e, i) => eraOrder.set(e.name, i));
    return Object.entries(groups).sort(([a], [b]) => {
      const aIdx = eraOrder.has(a) ? eraOrder.get(a)! : Infinity;
      const bIdx = eraOrder.has(b) ? eraOrder.get(b)! : Infinity;
      if (aIdx !== bIdx) return aIdx - bIdx;
      return a.localeCompare(b);
    });
  }, [events, filterEra, allDefinedEras]);

  const eras = useMemo(() => {
    const defined = allDefinedEras.map(e => e.name);
    const fromEvents = [...new Set(events.map(e => e.era || "Unclassified"))];
    const ordered: string[] = [...defined];
    fromEvents.forEach(e => { if (!ordered.includes(e)) ordered.push(e); });
    return ordered;
  }, [events, allDefinedEras]);

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-stone-500">
        <div className="text-center">
          <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No timeline events available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-stone-200" data-testid="text-timeline-title">Timeline</h2>
        {eras.length > 1 && (
          <div className="flex gap-1 flex-wrap">
            <Badge
              variant={filterEra === "" ? "default" : "outline"}
              className={`text-[10px] cursor-pointer ${filterEra === "" ? "bg-amber-500/20 text-amber-400" : "border-stone-700 text-stone-500"}`}
              onClick={() => setFilterEra("")}
            >All</Badge>
            {eras.map(era => (
              <Badge
                key={era}
                variant={filterEra === era ? "default" : "outline"}
                className="text-[10px] cursor-pointer border-stone-700 text-stone-500"
                style={filterEra === era ? { backgroundColor: (ERA_COLORS[era] || "#78909c") + "33", color: ERA_COLORS[era] || "#78909c" } : {}}
                onClick={() => setFilterEra(filterEra === era ? "" : era)}
              >{era}</Badge>
            ))}
          </div>
        )}
      </div>
      {grouped.map(([era, eraEvents]) => {
        const definedEra = allDefinedEras.find(e => e.name === era);
        const eraColor = definedEra?.color || ERA_COLORS[era] || "#78909c";
        return (
        <div key={era} className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: eraColor }} />
            <h3 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">{era}</h3>
            <div className="flex-1 h-px bg-stone-800" />
          </div>
          <div className="relative pl-6 border-l-2 border-stone-800 space-y-4">
            {eraEvents.map(event => {
              const linkedEntity = event.entityId ? entities.find(e => e.id === event.entityId) : null;
              return (
                <div key={event.id} className="relative" data-testid={`timeline-event-${event.id}`}>
                  <div className="absolute -left-[calc(1.5rem+5px)] w-3 h-3 rounded-full border-2 border-stone-800"
                    style={{ backgroundColor: event.color || ERA_COLORS[event.era || ""] || "#78909c" }} />
                  <div className="bg-stone-900/50 border border-stone-800 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-medium text-stone-200">{event.title}</h4>
                      {event.date && <Badge variant="outline" className="text-[9px] border-stone-700 text-stone-500">{event.date}{event.endDate ? ` — ${event.endDate}` : ""}</Badge>}
                    </div>
                    {event.description && <p className="text-xs text-stone-400 leading-relaxed">{event.description}</p>}
                    {linkedEntity && (
                      <button onClick={() => onSelectEntity(linkedEntity.id)} className="mt-2 flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300" data-testid={`timeline-entity-link-${event.id}`}>
                        <Link2 className="h-3 w-3" />
                        {linkedEntity.displayName}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        );
      })}
    </div>
  );
}

function SharedCalendarView({ calendars }: { calendars: SharedCalendar[] }) {
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  const [viewMonth, setViewMonth] = useState<number | null>(null);
  const [viewYear, setViewYear] = useState<number | null>(null);
  const [showJumpDialog, setShowJumpDialog] = useState(false);
  const [jumpMonth, setJumpMonth] = useState(0);
  const [jumpYear, setJumpYear] = useState(1);
  const [selectedDay, setSelectedDay] = useState<{ month: number; day: number } | null>(null);
  const [showDayDialog, setShowDayDialog] = useState(false);

  type CalendarEvent = { name: string; month: number; day: number; color?: string; description?: string; recurring?: boolean };

  const calendar = calendars.find(c => c.id === selectedCalendarId) || calendars[0];
  if (!calendar) {
    return (
      <div className="flex items-center justify-center h-full text-stone-500">
        <div className="text-center">
          <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No calendars available</p>
        </div>
      </div>
    );
  }

  const currentMonth = viewMonth ?? (calendar.currentMonth ?? 0);
  const currentYear = viewYear ?? (calendar.currentYear ?? 1);
  const daysInMonth = calendar.daysPerMonth[currentMonth] || 30;
  const weekDays = calendar.weekDayNames || [];
  const monthName = calendar.monthNames[currentMonth] || `Month ${currentMonth + 1}`;
  const yearSuffix = (calendar as any).yearSuffix || "AE";

  const notes = calendar.notes || {};
  const dayKey = (day: number) => `${currentYear}-${currentMonth}-${day}`;

  const calendarHolidays: CalendarEvent[] = ((calendar as any)?.events as CalendarEvent[]) || [];
  const holidaysForDay = (month: number, day: number) =>
    calendarHolidays.filter(h => h.month === month && h.day === day);

  const firstDayOffset = 0;
  const totalCells = Math.ceil((daysInMonth + firstDayOffset) / weekDays.length) * weekDays.length;

  const isCurrentDay = (day: number) =>
    currentMonth === (calendar.currentMonth ?? 0) &&
    currentYear === (calendar.currentYear ?? 1) &&
    day === (calendar.currentDay ?? 1);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setViewMonth(calendar.monthNames.length - 1);
      setViewYear((viewYear ?? (calendar.currentYear ?? 1)) - 1);
    } else {
      setViewMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth >= calendar.monthNames.length - 1) {
      setViewMonth(0);
      setViewYear((viewYear ?? (calendar.currentYear ?? 1)) + 1);
    } else {
      setViewMonth(currentMonth + 1);
    }
  };

  const handleDayClick = (day: number) => {
    setSelectedDay({ month: currentMonth, day });
    setShowDayDialog(true);
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {calendars.length > 1 && (
        <div className="flex gap-2 mb-4">
          {calendars.map(c => (
            <Button
              key={c.id}
              variant={c.id === (calendar?.id) ? "default" : "outline"}
              size="sm"
              className={`text-xs ${c.id === calendar?.id ? "bg-amber-600 text-white" : "border-stone-700 text-stone-400"}`}
              onClick={() => { setSelectedCalendarId(c.id); setViewMonth(null); setViewYear(null); }}
              data-testid={`calendar-tab-${c.id}`}
            >{c.name}</Button>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-stone-400 hover:text-stone-200" onClick={handlePrevMonth} data-testid="button-prev-month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <button
          className="text-center cursor-pointer hover:bg-stone-800/50 rounded-lg px-3 py-1 transition-colors group"
          onClick={() => { setJumpMonth(currentMonth); setJumpYear(currentYear); setShowJumpDialog(true); }}
          title="Jump to a specific month/year"
          data-testid="button-jump-date"
        >
          <h2 className="text-lg font-semibold text-stone-200 group-hover:text-amber-300 transition-colors" data-testid="text-calendar-month">
            {monthName} {currentYear} {yearSuffix}
          </h2>
        </button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-stone-400 hover:text-stone-200" onClick={handleNextMonth} data-testid="button-next-month">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid gap-px bg-stone-800 border border-stone-800 rounded-lg overflow-hidden" style={{ gridTemplateColumns: `repeat(${weekDays.length}, 1fr)` }}>
        {weekDays.map((day, i) => (
          <div key={i} className="bg-stone-900 px-2 py-1.5 text-center text-[10px] font-medium text-stone-500 uppercase tracking-wider">
            {day.slice(0, 3)}
          </div>
        ))}
        {Array.from({ length: totalCells }, (_, i) => {
          const dayNum = i - firstDayOffset + 1;
          const isValid = dayNum >= 1 && dayNum <= daysInMonth;
          const isCurrent = isValid && isCurrentDay(dayNum);
          const note = isValid ? notes[dayKey(dayNum)] : null;
          const dayHolidays = isValid ? holidaysForDay(currentMonth, dayNum) : [];
          const hasContent = !!note || dayHolidays.length > 0;
          return (
            <div
              key={i}
              className={`bg-stone-950 min-h-[60px] p-1.5 transition-colors ${isValid ? 'cursor-pointer hover:bg-stone-900/80' : 'opacity-30'} ${isCurrent ? 'ring-1 ring-amber-500/50 bg-amber-500/5' : ''}`}
              onClick={() => isValid && handleDayClick(dayNum)}
              data-testid={isValid ? `calendar-day-${dayNum}` : undefined}
            >
              {isValid && (
                <>
                  <div className="flex items-start justify-between">
                    <span className={`text-xs font-medium ${isCurrent ? 'text-amber-400' : 'text-stone-400'}`}>{dayNum}</span>
                    {hasContent && !isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-amber-500/40 mt-0.5" />}
                    {isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-0.5" />}
                  </div>
                  {dayHolidays.map((h, hi) => (
                    <div key={`h-${hi}`} className="mt-0.5 text-[8px] leading-tight px-0.5 py-px rounded truncate" style={{ backgroundColor: (h.color || "#ffb74d") + "22", color: h.color || "#ffb74d" }}>
                      {h.name}
                    </div>
                  ))}
                  {note && <p className="text-[9px] text-stone-500 mt-0.5 line-clamp-2">{typeof note === 'string' ? note : (note as any).text || ''}</p>}
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-center">
        <p className="text-xs text-stone-600">
          Current Date: {calendar.monthNames[calendar.currentMonth ?? 0]} {calendar.currentDay ?? 1}, {calendar.currentYear ?? 1} {yearSuffix}
        </p>
      </div>

      <Dialog open={showJumpDialog} onOpenChange={setShowJumpDialog}>
        <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-stone-100">Jump to Date</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-stone-400 mb-1 block">Month</label>
              <div className="grid grid-cols-3 gap-1.5">
                {calendar.monthNames.map((m, i) => (
                  <button
                    key={i}
                    className={`text-xs px-2 py-1.5 rounded border transition-colors ${jumpMonth === i ? 'bg-amber-600/30 border-amber-500/50 text-amber-300' : 'bg-stone-800 border-stone-700 text-stone-300 hover:border-stone-500'}`}
                    onClick={() => setJumpMonth(i)}
                    data-testid={`button-jump-month-${i}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-stone-400 mb-1 block">Year</label>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-stone-400" onClick={() => setJumpYear(y => y - 10)}>
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-stone-400" onClick={() => setJumpYear(y => y - 1)}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Input
                  type="number"
                  value={jumpYear}
                  onChange={(e) => setJumpYear(parseInt(e.target.value, 10) || 1)}
                  className="bg-stone-800 border-stone-700 text-stone-200 text-center flex-1"
                  data-testid="input-jump-year"
                />
                <Button variant="ghost" size="icon" className="h-8 w-8 text-stone-400" onClick={() => setJumpYear(y => y + 1)}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-stone-400" onClick={() => setJumpYear(y => y + 10)}>
                  <ChevronsRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="text-stone-400" onClick={() => setShowJumpDialog(false)}>Cancel</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-500 text-white"
              onClick={() => { setViewMonth(jumpMonth); setViewYear(jumpYear); setShowJumpDialog(false); }}
              data-testid="button-confirm-jump"
            >
              Go
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDayDialog} onOpenChange={setShowDayDialog}>
        <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-stone-100">
              {selectedDay ? `${calendar.monthNames[selectedDay.month] || `Month ${selectedDay.month + 1}`}, Day ${selectedDay.day}` : "Day Details"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {selectedDay && holidaysForDay(selectedDay.month, selectedDay.day).length > 0 && (
              <div>
                <h4 className="text-[10px] text-stone-500 uppercase tracking-wider mb-1">Events & Holidays</h4>
                {holidaysForDay(selectedDay.month, selectedDay.day).map((h, hi) => (
                  <div key={`hol-${hi}`} className="flex items-center gap-2 px-2 py-1.5 rounded bg-stone-800/50 mb-1">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: h.color || "#ffb74d" }} />
                    <span className="text-xs text-stone-300 flex-1">{h.name}</span>
                    {h.recurring !== false && <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400 px-1">Yearly</Badge>}
                  </div>
                ))}
                {holidaysForDay(selectedDay.month, selectedDay.day).filter(h => h.description).map((h, hi) => (
                  <p key={`desc-${hi}`} className="text-xs text-stone-400 pl-4 mt-0.5">{h.description}</p>
                ))}
              </div>
            )}
            {selectedDay && (() => {
              const note = notes[dayKey(selectedDay.day)];
              return note ? (
                <div>
                  <h4 className="text-[10px] text-stone-500 uppercase tracking-wider mb-1">Note</h4>
                  <p className="text-xs text-stone-300 bg-stone-800/50 rounded px-2 py-1.5 whitespace-pre-wrap">{typeof note === 'string' ? note : (note as any).text || ''}</p>
                </div>
              ) : null;
            })()}
            {selectedDay && holidaysForDay(selectedDay.month, selectedDay.day).length === 0 && !notes[dayKey(selectedDay.day)] && (
              <p className="text-xs text-stone-500 py-2">Nothing recorded for this day.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" className="text-stone-400" onClick={() => setShowDayDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function SharedWorldView() {
  const [matchWorld, paramsWorld] = useRoute("/world/:token");
  const [matchShared, paramsShared] = useRoute("/shared/:token");
  const token = paramsWorld?.token || paramsShared?.token;

  const { data, isLoading, error } = useQuery<SharedWorldData>({
    queryKey: ["shared-world", token],
    queryFn: async () => {
      const res = await fetch(`/api/shared/${token}`);
      if (!res.ok) throw new Error("Share link not found or expired");
      return res.json();
    },
    enabled: !!token,
  });

  const [activeSection, setActiveSection] = useState<ActiveSection>("home");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [initialEntityHandled, setInitialEntityHandled] = useState(false);

  const entities = data?.entities || [];
  const entityLinks = data?.entityLinks || [];
  const maps = data?.maps || [];
  const mapPins = data?.mapPins || {};
  const calendars = data?.calendars || [];
  const timelineEvents = data?.timelineEvents || [];

  const filteredEntities = useMemo(() => {
    let result = entities;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e => e.displayName.toLowerCase().includes(q) || e.description?.toLowerCase().includes(q));
    }
    if (filterType) result = result.filter(e => {
      const entityTags = (e.tags as string[]) || [];
      return entityTags.includes(filterType);
    });
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

  const selectedEntity = entities.find(e => e.id === selectedEntityId);

  useEffect(() => {
    if (data && entities.length > 0 && !initialEntityHandled) {
      setInitialEntityHandled(true);
      const hash = window.location.hash;
      if (hash && hash.startsWith('#entity=')) {
        const entityId = hash.replace('#entity=', '');
        const found = entities.find(e => e.id === entityId);
        if (found) {
          setSelectedEntityId(entityId);
          setActiveSection("encyclopedia");
        }
      }
    }
  }, [data, entities, initialEntityHandled]);

  const handleSelectEntity = (entityId: string) => {
    setSelectedEntityId(entityId);
    setActiveSection("encyclopedia");
    setMobileSidebarOpen(false);
    window.history.replaceState(null, '', `${window.location.pathname}#entity=${entityId}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center" data-testid="shared-world-loading">
        <div className="text-center">
          <LoadingLogo className="h-8 w-8 text-amber-500 mx-auto mb-3" />
          <p className="text-stone-500 text-sm">Loading world...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center" data-testid="shared-world-error">
        <div className="text-center p-8">
          <Globe className="h-16 w-16 text-stone-700 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-stone-400 mb-2">World Not Found</h1>
          <p className="text-stone-600 text-sm">This share link may have expired or been revoked.</p>
        </div>
      </div>
    );
  }

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0f0d0c]">
      <div className="p-4 border-b border-amber-500/10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center flex-shrink-0 border border-amber-500/20">
              <Globe className="h-3.5 w-3.5 text-amber-400" />
            </div>
            <h2 className="text-sm font-bold text-stone-200 truncate" data-testid="text-campaign-name">{data.campaignName}</h2>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-stone-500 hover:text-stone-300 md:hidden" onClick={() => setMobileSidebarOpen(false)} data-testid="button-close-sidebar">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <nav className="p-3 space-y-1 border-b border-stone-800/50">
        <p className="text-[10px] text-stone-600 uppercase tracking-widest font-semibold mb-2 px-2">Navigation</p>
        {SECTION_CONFIG.map(({ key, label, icon: Icon }) => {
          const hasContent = key === "home" ? true :
                            key === "encyclopedia" ? entities.length > 0 :
                            key === "maps" ? maps.length > 0 :
                            key === "timeline" ? timelineEvents.length > 0 :
                            key === "calendar" ? calendars.length > 0 : false;
          if (!hasContent) return null;
          const sectionCount = key === "encyclopedia" ? entities.length : key === "maps" ? maps.length : key === "timeline" ? timelineEvents.length : key === "calendar" ? calendars.length : 0;
          return (
            <button
              key={key}
              onClick={() => { setActiveSection(key); setSelectedEntityId(null); setMobileSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs transition-all duration-200 ${
                activeSection === key
                  ? 'bg-gradient-to-r from-amber-500/15 to-amber-500/5 text-amber-300 shadow-sm shadow-amber-500/5 border border-amber-500/20'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/40 border border-transparent'
              }`}
              data-testid={`nav-section-${key}`}
            >
              <Icon className={`h-4 w-4 flex-shrink-0 ${activeSection === key ? 'text-amber-400' : ''}`} />
              <span className="font-medium flex-1 text-left">{label}</span>
              {key !== "home" && sectionCount > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeSection === key ? 'bg-amber-500/20 text-amber-400' : 'bg-stone-800 text-stone-500'}`}>{sectionCount}</span>
              )}
            </button>
          );
        })}
      </nav>

      {activeSection === "encyclopedia" && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-2 border-b border-stone-800">
            <div className="relative mb-1.5">
              <Search className="absolute left-2 top-1.5 h-3 w-3 text-stone-500" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search articles..."
                className="pl-7 h-6 text-[11px] bg-stone-800 border-stone-700 text-stone-200"
                data-testid="input-search"
              />
            </div>
            <div className="flex flex-wrap gap-0.5">
              <Badge
                variant={filterType === "" ? "default" : "outline"}
                className={`text-[8px] cursor-pointer px-1 py-0 ${filterType === "" ? "bg-amber-500/20 text-amber-400 border-amber-500/50" : "border-stone-700 text-stone-500"}`}
                onClick={() => setFilterType("")}
              >All ({entities.length})</Badge>
              {Object.entries(tagCounts).sort(([, a], [, b]) => b - a).map(([tag, count]) => (
                <Badge
                  key={tag}
                  variant={filterType === tag ? "default" : "outline"}
                  className={`text-[8px] cursor-pointer px-1 py-0 ${filterType === tag ? "text-white" : "border-stone-700 text-stone-500"}`}
                  style={filterType === tag ? { backgroundColor: (TAG_COLORS[tag] || "#78909c") + "33", color: TAG_COLORS[tag] || "#78909c", borderColor: (TAG_COLORS[tag] || "#78909c") + "55" } : {}}
                  onClick={() => setFilterType(filterType === tag ? "" : tag)}
                >{tag} ({count})</Badge>
              ))}
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-0.5">
              {filteredEntities.length === 0 ? (
                <div className="text-center py-6 text-stone-600 text-xs">
                  {searchQuery ? "No matching articles" : "No articles available"}
                </div>
              ) : filteredEntities.map(entity => {
                const entityTags = (entity.tags as string[]) || [];
                const firstTagColor = entityTags.length > 0 ? (TAG_COLORS[entityTags[0]] || "#78909c") : "#78909c";
                const cfg = ENTITY_TYPE_CONFIG[entity.entityType];
                const IconComp = cfg ? ICON_MAP[cfg.icon] || Search : FileText;
                return (
                  <button
                    key={entity.id}
                    onClick={() => handleSelectEntity(entity.id)}
                    className={`w-full text-left px-2 py-1.5 rounded-md transition-colors group flex items-center gap-2 ${
                      selectedEntityId === entity.id ? 'bg-stone-800 border-l-2 border-amber-400' : 'hover:bg-stone-800/60'
                    }`}
                    data-testid={`entity-list-item-${entity.id}`}
                  >
                    <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: firstTagColor + "18" }}>
                      <IconComp className="h-2.5 w-2.5" style={{ color: firstTagColor }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-[11px] font-medium truncate ${selectedEntityId === entity.id ? 'text-amber-400' : 'text-stone-300 group-hover:text-stone-100'}`}>
                        {entity.displayName}
                      </div>
                      {entityTags.length > 0 && (
                        <div className="flex gap-0.5 mt-0.5">{entityTags.slice(0, 2).map(t => (
                          <span key={t} className="text-[7px] px-1 rounded" style={{ backgroundColor: (TAG_COLORS[t] || "#78909c") + "20", color: TAG_COLORS[t] || "#78909c" }}>{t}</span>
                        ))}</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100" data-testid="shared-world-page">
      <header className="border-b border-amber-500/10 bg-[#0f0d0c]/95 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center justify-between px-3 md:px-6 py-2.5">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="md:hidden h-8 w-8 text-stone-400 hover:text-amber-400" onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)} data-testid="button-toggle-sidebar">
              {mobileSidebarOpen ? <X className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
            </Button>
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-amber-400" />
              <h1 className="text-sm font-bold text-stone-200 truncate" data-testid="text-world-title">{data.campaignName}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-stone-500 font-medium uppercase tracking-wider">
              {SECTION_CONFIG.find(s => s.key === activeSection)?.label}
            </span>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-49px)] relative">
        {mobileSidebarOpen && (
          <div className="absolute inset-0 z-40 bg-black/50 md:hidden" onClick={() => setMobileSidebarOpen(false)} />
        )}

        <div className={`md:w-64 md:relative md:translate-x-0 absolute inset-y-0 left-0 z-50 w-full max-w-xs bg-[#0f0d0c] border-r border-amber-500/10 flex flex-col transition-transform duration-200 ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
          {sidebarContent}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {activeSection === "home" && (
            <div className="flex-1 overflow-y-auto bg-[#0c0a09]" data-testid="section-home">
              <div className="relative w-full" style={{ minHeight: data.worldImage ? '340px' : '200px' }}>
                {data.worldImage ? (
                  <>
                    <img src={data.worldImage} alt={data.campaignName} className="absolute inset-0 w-full h-full object-cover" data-testid="img-world-banner" />
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
                  <h1 className="text-3xl md:text-5xl font-bold text-white tracking-tight drop-shadow-lg" data-testid="text-home-heading" style={{ textShadow: '0 2px 20px rgba(0,0,0,0.8)' }}>
                    {data.campaignName}
                  </h1>
                  {data.worldDescription && (
                    <p className="mt-4 max-w-2xl text-base md:text-lg text-stone-300/90 italic leading-relaxed" data-testid="text-home-description" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}>
                      "{data.worldDescription}"
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
                  {maps.length > 0 && (
                    <div className="flex items-center gap-2 text-stone-400">
                      <Map className="h-3.5 w-3.5 text-emerald-500/70" />
                      <span className="text-xs font-medium">{maps.length} Maps</span>
                    </div>
                  )}
                  {timelineEvents.length > 0 && (
                    <div className="flex items-center gap-2 text-stone-400">
                      <Clock className="h-3.5 w-3.5 text-purple-500/70" />
                      <span className="text-xs font-medium">{timelineEvents.length} Events</span>
                    </div>
                  )}
                  {calendars.length > 0 && (
                    <div className="flex items-center gap-2 text-stone-400">
                      <Calendar className="h-3.5 w-3.5 text-blue-500/70" />
                      <span className="text-xs font-medium">{calendars.length} Calendars</span>
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
                {data.homeContent && (
                  <div className="mb-12" data-testid="home-article-content">
                    <div className="bg-stone-900/40 rounded-xl border border-stone-800/60 p-6 md:p-10 backdrop-blur-sm shadow-xl shadow-black/20">
                      <SharedArticlePreview content={data.homeContent} entities={entities} onEntityClick={handleSelectEntity} />
                    </div>
                  </div>
                )}

                {(entities.length > 0 || maps.length > 0 || timelineEvents.length > 0 || calendars.length > 0) && (
                  <div className="mb-12">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="h-px flex-1 bg-gradient-to-r from-amber-500/30 to-transparent" />
                      <h3 className="text-sm font-bold text-amber-400/80 uppercase tracking-[0.2em]">Explore This World</h3>
                      <div className="h-px flex-1 bg-gradient-to-l from-amber-500/30 to-transparent" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {entities.length > 0 && (
                        <button
                          onClick={() => { setActiveSection("encyclopedia"); setSelectedEntityId(null); }}
                          className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-stone-900 to-stone-900/60 border border-stone-800/60 hover:border-amber-500/40 transition-all duration-300 text-left p-5 hover:shadow-lg hover:shadow-amber-500/5"
                          data-testid="home-card-encyclopedia"
                        >
                          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-amber-500/5 to-transparent rounded-bl-full" />
                          <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-3">
                              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center border border-amber-500/20">
                                <BookOpen className="h-5 w-5 text-amber-400" />
                              </div>
                              <div>
                                <div className="text-base font-semibold text-stone-100 group-hover:text-amber-300 transition-colors">Encyclopedia</div>
                                <div className="text-xs text-stone-500">{entities.length} {entities.length === 1 ? 'article' : 'articles'}</div>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(tagCounts).sort(([, a], [, b]) => b - a).slice(0, 5).map(([tag, count]) => (
                                <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-stone-800/80 border border-stone-700/50">
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TAG_COLORS[tag] || "#78909c" }} />
                                  <span className="text-stone-400">{tag} {count}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                          <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-700 group-hover:text-amber-400 group-hover:translate-x-1 transition-all" />
                        </button>
                      )}
                      {maps.length > 0 && (
                        <button
                          onClick={() => { setActiveSection("maps"); setSelectedEntityId(null); }}
                          className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-stone-900 to-stone-900/60 border border-stone-800/60 hover:border-emerald-500/40 transition-all duration-300 text-left p-5 hover:shadow-lg hover:shadow-emerald-500/5"
                          data-testid="home-card-maps"
                        >
                          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-emerald-500/5 to-transparent rounded-bl-full" />
                          <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-3">
                              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 flex items-center justify-center border border-emerald-500/20">
                                <Map className="h-5 w-5 text-emerald-400" />
                              </div>
                              <div>
                                <div className="text-base font-semibold text-stone-100 group-hover:text-emerald-300 transition-colors">World Maps</div>
                                <div className="text-xs text-stone-500">{maps.length} {maps.length === 1 ? 'map' : 'maps'} to explore</div>
                              </div>
                            </div>
                            <p className="text-xs text-stone-500 leading-relaxed">Navigate the lands, discover hidden locations, and trace the paths between civilizations.</p>
                          </div>
                          <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-700 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
                        </button>
                      )}
                      {timelineEvents.length > 0 && (
                        <button
                          onClick={() => { setActiveSection("timeline"); setSelectedEntityId(null); }}
                          className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-stone-900 to-stone-900/60 border border-stone-800/60 hover:border-purple-500/40 transition-all duration-300 text-left p-5 hover:shadow-lg hover:shadow-purple-500/5"
                          data-testid="home-card-timeline"
                        >
                          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-purple-500/5 to-transparent rounded-bl-full" />
                          <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-3">
                              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 flex items-center justify-center border border-purple-500/20">
                                <Clock className="h-5 w-5 text-purple-400" />
                              </div>
                              <div>
                                <div className="text-base font-semibold text-stone-100 group-hover:text-purple-300 transition-colors">Timeline</div>
                                <div className="text-xs text-stone-500">{timelineEvents.length} {timelineEvents.length === 1 ? 'event' : 'events'} recorded</div>
                              </div>
                            </div>
                            <p className="text-xs text-stone-500 leading-relaxed">Trace the history of this world through ages, eras, and defining moments.</p>
                          </div>
                          <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-700 group-hover:text-purple-400 group-hover:translate-x-1 transition-all" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {entities.length > 0 && (
                  <div className="mb-12">
                    <div className="flex items-center gap-4 mb-5">
                      <div className="h-px flex-1 bg-gradient-to-r from-amber-500/30 to-transparent" />
                      <h3 className="text-sm font-bold text-amber-400/80 uppercase tracking-[0.2em]">Featured Articles</h3>
                      <div className="h-px flex-1 bg-gradient-to-l from-amber-500/30 to-transparent" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {entities.slice(0, 6).map(entity => {
                        const cfg = ENTITY_TYPE_CONFIG[entity.entityType];
                        const TypeIcon = cfg ? ICON_MAP[cfg.icon] || Search : Search;
                        return (
                          <button
                            key={entity.id}
                            onClick={() => handleSelectEntity(entity.id)}
                            className="group text-left rounded-lg bg-stone-900/50 border border-stone-800/50 hover:border-amber-500/30 transition-all duration-200 overflow-hidden hover:shadow-md hover:shadow-black/20"
                            data-testid={`featured-entity-${entity.id}`}
                          >
                            {entity.image && (
                              <div className="h-28 overflow-hidden">
                                <img src={entity.image} alt={entity.displayName} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                              </div>
                            )}
                            <div className="p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <TypeIcon className="h-3 w-3 flex-shrink-0" style={{ color: cfg?.color }} />
                                <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: cfg?.color + 'aa' }}>{cfg?.label}</span>
                              </div>
                              <h4 className="text-sm font-semibold text-stone-200 group-hover:text-amber-300 transition-colors truncate">{entity.displayName}</h4>
                              {entity.description && (
                                <p className="text-[11px] text-stone-500 mt-1 line-clamp-2 leading-relaxed">{entity.description}</p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {entities.length > 6 && (
                      <div className="text-center mt-4">
                        <button
                          onClick={() => { setActiveSection("encyclopedia"); setSelectedEntityId(null); }}
                          className="text-xs text-amber-400/70 hover:text-amber-300 transition-colors"
                          data-testid="link-view-all-articles"
                        >
                          View all {entities.length} articles &rarr;
                        </button>
                      </div>
                    )}
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
                  <p className="text-[11px] text-stone-600">{data.campaignName}</p>
                </div>
              </div>
            </div>
          )}

          {activeSection === "encyclopedia" && (
            <>
              {selectedEntity ? (
                <div className="flex-1 overflow-y-auto">
                  <div className="max-w-3xl mx-auto">
                    <div className="px-4 md:px-8 pt-4 md:pt-6">
                      <div className="flex items-center gap-2 mb-3">
                        <Button variant="ghost" size="sm" className="text-stone-500 text-xs h-6 px-2" onClick={() => { setSelectedEntityId(null); window.history.replaceState(null, '', window.location.pathname); }} data-testid="button-back-to-list">
                          <ChevronLeft className="h-3 w-3 mr-1" /> Back
                        </Button>
                      </div>
                    </div>
                    {selectedEntity.image && (
                      <div className="relative w-full h-48 md:h-64 mb-6 overflow-hidden">
                        <img src={selectedEntity.image} alt={selectedEntity.displayName} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0c0a09] via-[#0c0a09]/40 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8">
                          {(() => {
                            const cfg = ENTITY_TYPE_CONFIG[selectedEntity.entityType];
                            return (
                              <div>
                                <Badge variant="outline" className="text-[9px] mb-2" style={{ borderColor: cfg?.color + "55", color: cfg?.color }}>{cfg?.label}</Badge>
                                <h1 className="text-2xl md:text-3xl font-bold text-stone-100" data-testid="text-entity-name">{selectedEntity.displayName}</h1>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                    <div className="px-4 md:px-8 pb-8">
                    {!selectedEntity.image && (
                      <div className="flex items-center gap-3 mb-5">
                        {(() => {
                          const cfg = ENTITY_TYPE_CONFIG[selectedEntity.entityType];
                          const IconComp = cfg ? ICON_MAP[cfg.icon] || Search : Search;
                          return (
                            <>
                              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: cfg?.color + "22" }}>
                                <IconComp className="h-5 w-5" style={{ color: cfg?.color }} />
                              </div>
                              <div>
                                <h1 className="text-2xl font-bold text-stone-100" data-testid="text-entity-name">{selectedEntity.displayName}</h1>
                                <Badge variant="outline" className="text-[9px] mt-0.5" style={{ borderColor: cfg?.color + "55", color: cfg?.color }}>{cfg?.label}</Badge>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                    {selectedEntity.description && (
                      <p className="text-sm text-stone-400 italic mb-5 border-l-2 border-amber-500/30 pl-3">{selectedEntity.description}</p>
                    )}
                    {selectedEntity.tags && selectedEntity.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-5">
                        {selectedEntity.tags.map((tag, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0" style={{ borderColor: (TAG_COLORS[tag] || "#78909c") + "55", color: TAG_COLORS[tag] || "#78909c", backgroundColor: (TAG_COLORS[tag] || "#78909c") + "15" }}>{tag}</Badge>
                        ))}
                      </div>
                    )}
                    {(() => {
                      const loreFields = (selectedEntity as any).loreFields as Record<string, any> | null;
                      const dataKey = `${selectedEntity.entityType}Data`;
                      const typeData = (selectedEntity as any)[dataKey] as Record<string, any> | null;
                      const fields = loreFields || typeData;
                      if (!fields || Object.keys(fields).length === 0) return null;
                      const entries = Object.entries(fields).filter(([_, v]) => v && (typeof v !== 'string' || v.trim()) && (!Array.isArray(v) || v.filter(Boolean).length > 0));
                      if (entries.length === 0) return null;
                      return (
                        <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 bg-stone-900/30 rounded-lg p-3 border border-stone-800/50">
                          {entries.map(([key, value]) => (
                            <div key={key} className={typeof value === 'string' && value.length > 60 ? 'col-span-2' : ''}>
                              <span className="text-[10px] text-stone-500 uppercase tracking-wider">{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</span>
                              <div className="text-xs text-stone-300">{Array.isArray(value) ? value.filter(Boolean).join(', ') : String(value)}</div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {selectedEntity.articleContent && (
                      selectedEntity.entityType === "canvas" ? (
                        <CanvasReadOnlyView content={selectedEntity.articleContent} />
                      ) : (
                        <SharedArticlePreview content={selectedEntity.articleContent} entities={entities} onEntityClick={handleSelectEntity} />
                      )
                    )}
                    {entityLinks.filter(l => l.fromEntityId === selectedEntity.id || l.toEntityId === selectedEntity.id).length > 0 && (
                      <div className="mt-6 pt-4">
                        <div className="mb-4 h-px" style={{ background: "linear-gradient(to right, transparent, rgba(245,158,11,0.3), transparent)" }} />
                        <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Related</h3>
                        <div className="space-y-1">
                          {entityLinks
                            .filter(l => l.fromEntityId === selectedEntity.id || l.toEntityId === selectedEntity.id)
                            .map(link => {
                              const targetId = link.fromEntityId === selectedEntity.id ? link.toEntityId : link.fromEntityId;
                              const target = entities.find(e => e.id === targetId);
                              if (!target) return null;
                              const cfg = ENTITY_TYPE_CONFIG[target.entityType];
                              const IconComp = cfg ? ICON_MAP[cfg.icon] || Search : Search;
                              return (
                                <button
                                  key={link.id}
                                  onClick={() => handleSelectEntity(targetId)}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-stone-800/50 transition-colors"
                                  data-testid={`related-entity-${targetId}`}
                                >
                                  <IconComp className="h-3 w-3 flex-shrink-0" style={{ color: cfg?.color }} />
                                  <span className="text-xs text-stone-300 hover:text-amber-400">{target.displayName}</span>
                                  {link.label && <Badge variant="outline" className="text-[8px] border-stone-700 text-stone-600 ml-auto">{link.label}</Badge>}
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="sticky top-0 z-10 bg-[#0c0a09]/95 backdrop-blur-md border-b border-stone-800/60 px-4 md:px-6 py-3">
                    <div className="max-w-5xl mx-auto">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <BookOpen className="h-5 w-5 text-amber-400" />
                          <h2 className="text-sm font-semibold text-stone-200">Encyclopedia</h2>
                          <span className="text-[11px] text-stone-500">{entities.length} article{entities.length !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <div className="relative mb-2.5">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
                        <Input
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search articles..."
                          className="pl-9 h-9 text-sm bg-stone-800/80 border-stone-700 text-stone-200 rounded-lg"
                          data-testid="input-encyclopedia-grid-search"
                        />
                        {searchQuery && (
                          <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300" data-testid="button-clear-grid-search">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge
                          variant={filterType === "" ? "default" : "outline"}
                          className={`text-[10px] cursor-pointer px-2 py-0.5 ${filterType === "" ? "bg-amber-500/20 text-amber-400 border-amber-500/50" : "border-stone-700 text-stone-500 hover:text-stone-300"}`}
                          onClick={() => setFilterType("")}
                          data-testid="grid-filter-all"
                        >
                          All ({entities.length})
                        </Badge>
                        {Object.entries(tagCounts).sort(([, a], [, b]) => b - a).map(([tag, count]) => (
                          <Badge
                            key={tag}
                            variant={filterType === tag ? "default" : "outline"}
                            className={`text-[10px] cursor-pointer px-2 py-0.5 ${filterType === tag ? "text-white" : "border-stone-700 text-stone-500 hover:text-stone-300"}`}
                            style={filterType === tag ? { backgroundColor: (TAG_COLORS[tag] || "#78909c") + "33", color: TAG_COLORS[tag] || "#78909c", borderColor: (TAG_COLORS[tag] || "#78909c") + "55" } : {}}
                            onClick={() => setFilterType(filterType === tag ? "" : tag)}
                            data-testid={`grid-filter-${tag}`}
                          >
                            {tag} ({count})
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
                    <div className="max-w-5xl mx-auto">
                      {filteredEntities.length === 0 ? (
                        <div className="text-center py-16">
                          <BookOpen className="h-10 w-10 text-stone-700 mx-auto mb-3" />
                          <p className="text-stone-500 text-sm">{searchQuery || filterType ? "No matching articles found." : "No articles available."}</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                          {filteredEntities.map(entity => {
                            const cfg = ENTITY_TYPE_CONFIG[entity.entityType];
                            const IconComp = cfg ? ICON_MAP[cfg.icon] || FileText : FileText;
                            const entityTags = (entity.tags as string[]) || [];
                            return (
                              <button
                                key={entity.id}
                                onClick={() => handleSelectEntity(entity.id)}
                                className="text-left p-3 rounded-lg bg-stone-900/50 border border-stone-800/50 hover:border-amber-500/30 hover:bg-stone-800/50 transition-all group"
                                data-testid={`grid-article-${entity.id}`}
                              >
                                <div className="flex items-start gap-2.5">
                                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: (cfg?.color || "#78909c") + "15" }}>
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
                                        {entityTags.length > 3 && <span className="text-[8px] text-stone-500">+{entityTags.length - 3}</span>}
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
                  </div>
                </div>
              )}
            </>
          )}

          {activeSection === "maps" && (
            <div className="flex-1 min-h-0 flex flex-col">
              <SharedMapViewer
                maps={maps}
                mapPins={mapPins}
                entities={entities}
                onNavigateToEntity={handleSelectEntity}
              />
            </div>
          )}

          {activeSection === "timeline" && (
            <div className="flex-1 overflow-y-auto">
              <SharedTimelineView
                events={timelineEvents}
                entities={entities}
                calendars={calendars}
                timelines={data?.timelines || []}
                onSelectEntity={handleSelectEntity}
              />
            </div>
          )}

          {activeSection === "calendar" && (
            <div className="flex-1 overflow-hidden overflow-y-auto">
              <SharedCalendarView calendars={calendars} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
