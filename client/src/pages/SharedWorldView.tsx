import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Globe, BookOpen, Map, Clock, Calendar, Network, Search, MapPin, User, Shield, Scroll, Package, Swords, Sparkles, FileText, Loader2, ChevronRight, ChevronLeft, ZoomIn, ZoomOut, Maximize2, Navigation, Link2, X, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

const ENTITY_TYPE_CONFIG: Record<string, { label: string; pluralLabel: string; color: string; icon: string }> = {
  character: { label: "Character", pluralLabel: "Characters", color: "#e57373", icon: "User" },
  location: { label: "Location", pluralLabel: "Locations", color: "#81c784", icon: "MapPin" },
  faction: { label: "Faction", pluralLabel: "Factions", color: "#64b5f6", icon: "Shield" },
  quest: { label: "Quest", pluralLabel: "Quests", color: "#ffb74d", icon: "Scroll" },
  event: { label: "Event", pluralLabel: "Events", color: "#ce93d8", icon: "Calendar" },
  lore: { label: "Lore", pluralLabel: "Lore", color: "#a1887f", icon: "BookOpen" },
  item: { label: "Item", pluralLabel: "Items", color: "#4db6ac", icon: "Package" },
  encounter: { label: "Encounter", pluralLabel: "Encounters", color: "#ef5350", icon: "Swords" },
  clue: { label: "Clue", pluralLabel: "Clues", color: "#7986cb", icon: "Search" },
  magic: { label: "Magic", pluralLabel: "Magic", color: "#ba68c8", icon: "Sparkles" },
  timeline: { label: "Timeline", pluralLabel: "Timelines", color: "#90a4ae", icon: "Clock" },
  article: { label: "Article", pluralLabel: "Articles", color: "#fff176", icon: "FileText" },
};

const ICON_MAP: Record<string, React.ElementType> = {
  User, MapPin, Shield, Scroll, Calendar, BookOpen, Package, Swords, Search, Sparkles, Clock, FileText,
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

interface SharedWorldData {
  campaignName: string;
  entities: SharedEntity[];
  entityLinks: SharedEntityLink[];
  maps: SharedWorldMap[];
  mapPins: Record<string, SharedWorldMapPin[]>;
  calendars: SharedCalendar[];
  timelineEvents: SharedTimelineEvent[];
}

type ActiveSection = "encyclopedia" | "maps" | "timeline" | "calendar";

const SECTION_CONFIG: { key: ActiveSection; label: string; icon: React.ElementType }[] = [
  { key: "encyclopedia", label: "Encyclopedia", icon: BookOpen },
  { key: "maps", label: "Maps", icon: Map },
  { key: "timeline", label: "Timeline", icon: Clock },
  { key: "calendar", label: "Calendar", icon: Calendar },
];

function renderArticleContent(content: string) {
  const lines = content.split("\n");
  return lines.map((line, i) => {
    if (line.startsWith("### ")) return <h3 key={i} className="text-base font-semibold text-stone-200 mt-4 mb-2">{line.slice(4)}</h3>;
    if (line.startsWith("## ")) return <h2 key={i} className="text-lg font-semibold text-stone-200 mt-5 mb-2">{line.slice(3)}</h2>;
    if (line.startsWith("# ")) return <h1 key={i} className="text-xl font-bold text-stone-100 mt-6 mb-3">{line.slice(2)}</h1>;
    if (line.startsWith("- ")) return <li key={i} className="ml-4 text-stone-300 text-sm list-disc">{line.slice(2)}</li>;
    if (line.startsWith("---")) return <hr key={i} className="border-stone-700 my-4" />;
    if (line.trim() === "") return <div key={i} className="h-2" />;
    const formatted = line
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-stone-200">$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
    return <p key={i} className="text-stone-300 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: formatted }} />;
  });
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
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
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

function SharedTimelineView({ events, entities, calendars, onSelectEntity }: {
  events: SharedTimelineEvent[];
  entities: SharedEntity[];
  calendars: SharedCalendar[];
  onSelectEntity: (entityId: string) => void;
}) {
  const [filterEra, setFilterEra] = useState<string>("");

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
    return groups;
  }, [events, filterEra]);

  const eras = useMemo(() => [...new Set(events.map(e => e.era || "Unclassified"))], [events]);

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
      {Object.entries(grouped).map(([era, eraEvents]) => (
        <div key={era} className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ERA_COLORS[era] || "#78909c" }} />
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
      ))}
    </div>
  );
}

function SharedCalendarView({ calendars }: { calendars: SharedCalendar[] }) {
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  const [viewMonth, setViewMonth] = useState<number | null>(null);
  const [viewYear, setViewYear] = useState<number | null>(null);

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
        <h2 className="text-lg font-semibold text-stone-200" data-testid="text-calendar-month">
          {monthName} {currentYear} {yearSuffix}
        </h2>
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
          return (
            <div
              key={i}
              className={`bg-stone-950 min-h-[60px] p-1.5 ${isCurrent ? 'ring-1 ring-amber-500/50 bg-amber-500/5' : ''} ${!isValid ? 'opacity-30' : ''}`}
              data-testid={isValid ? `calendar-day-${dayNum}` : undefined}
            >
              {isValid && (
                <>
                  <span className={`text-xs font-medium ${isCurrent ? 'text-amber-400' : 'text-stone-400'}`}>{dayNum}</span>
                  {note && <p className="text-[9px] text-stone-500 mt-0.5 line-clamp-2">{typeof note === 'string' ? note : note.text || ''}</p>}
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
    </div>
  );
}

export default function SharedWorldView() {
  const [, params] = useRoute("/shared/:token");
  const token = params?.token;

  const { data, isLoading, error } = useQuery<SharedWorldData>({
    queryKey: ["shared-world", token],
    queryFn: async () => {
      const res = await fetch(`/api/shared/${token}`);
      if (!res.ok) throw new Error("Share link not found or expired");
      return res.json();
    },
    enabled: !!token,
  });

  const [activeSection, setActiveSection] = useState<ActiveSection>("encyclopedia");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

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
    if (filterType) result = result.filter(e => e.entityType === filterType);
    return result.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [entities, searchQuery, filterType]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    entities.forEach(e => { counts[e.entityType] = (counts[e.entityType] || 0) + 1; });
    return counts;
  }, [entities]);

  const selectedEntity = entities.find(e => e.id === selectedEntityId);

  const handleSelectEntity = (entityId: string) => {
    setSelectedEntityId(entityId);
    setActiveSection("encyclopedia");
    setMobileSidebarOpen(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center" data-testid="shared-world-loading">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500 mx-auto mb-3" />
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
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-stone-700">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-amber-400" />
            <h2 className="text-xs font-semibold text-stone-300 uppercase tracking-wider" data-testid="text-campaign-name">{data.campaignName}</h2>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-stone-500 hover:text-stone-300 md:hidden" onClick={() => setMobileSidebarOpen(false)} data-testid="button-close-sidebar">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400/70">Shared World</Badge>
      </div>

      <nav className="p-2 border-b border-stone-800">
        {SECTION_CONFIG.map(({ key, label, icon: Icon }) => {
          const hasContent = key === "encyclopedia" ? entities.length > 0 :
                            key === "maps" ? maps.length > 0 :
                            key === "timeline" ? timelineEvents.length > 0 :
                            key === "calendar" ? calendars.length > 0 : false;
          if (!hasContent) return null;
          return (
            <button
              key={key}
              onClick={() => { setActiveSection(key); setSelectedEntityId(null); setMobileSidebarOpen(false); }}
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
              {Object.entries(ENTITY_TYPE_CONFIG).map(([key, cfg]) => {
                const count = typeCounts[key] || 0;
                if (count === 0) return null;
                return (
                  <Badge
                    key={key}
                    variant={filterType === key ? "default" : "outline"}
                    className={`text-[8px] cursor-pointer px-1 py-0 ${filterType === key ? "text-white" : "border-stone-700 text-stone-500"}`}
                    style={filterType === key ? { backgroundColor: cfg.color + "33", color: cfg.color, borderColor: cfg.color + "55" } : {}}
                    onClick={() => setFilterType(filterType === key ? "" : key)}
                  >{cfg.label} ({count})</Badge>
                );
              })}
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-0.5">
              {filteredEntities.length === 0 ? (
                <div className="text-center py-6 text-stone-600 text-xs">
                  {searchQuery ? "No matching articles" : "No articles available"}
                </div>
              ) : filteredEntities.map(entity => {
                const cfg = ENTITY_TYPE_CONFIG[entity.entityType];
                const IconComp = cfg ? ICON_MAP[cfg.icon] || Search : Search;
                return (
                  <button
                    key={entity.id}
                    onClick={() => handleSelectEntity(entity.id)}
                    className={`w-full text-left px-2 py-1.5 rounded-md transition-colors group flex items-center gap-2 ${
                      selectedEntityId === entity.id ? 'bg-stone-800 border-l-2 border-amber-400' : 'hover:bg-stone-800/60'
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
                      {entity.description && <div className="text-[9px] text-stone-500 truncate">{entity.description}</div>}
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
      <header className="border-b border-stone-800 bg-stone-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center justify-between px-3 md:px-6 py-2.5">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="md:hidden h-8 w-8 text-stone-400" onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)} data-testid="button-toggle-sidebar">
              {mobileSidebarOpen ? <X className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
            </Button>
            <Globe className="h-5 w-5 text-amber-400" />
            <h1 className="text-sm md:text-base font-semibold text-stone-200 truncate" data-testid="text-world-title">{data.campaignName}</h1>
            <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400/70 hidden md:inline-flex">Shared World</Badge>
          </div>
          <Badge variant="outline" className="text-[10px] border-stone-700 text-stone-500">
            {SECTION_CONFIG.find(s => s.key === activeSection)?.label}
          </Badge>
        </div>
      </header>

      <div className="flex h-[calc(100vh-49px)] relative">
        {mobileSidebarOpen && (
          <div className="absolute inset-0 z-40 bg-black/50 md:hidden" onClick={() => setMobileSidebarOpen(false)} />
        )}

        <div className={`md:w-64 md:relative md:translate-x-0 absolute inset-y-0 left-0 z-50 w-full max-w-xs bg-stone-900 border-r border-stone-800 flex flex-col transition-transform duration-200 ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
          {sidebarContent}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {activeSection === "encyclopedia" && (
            <>
              {selectedEntity ? (
                <div className="flex-1 overflow-y-auto">
                  <div className="max-w-3xl mx-auto p-4 md:p-8">
                    <div className="flex items-center gap-2 mb-1">
                      <Button variant="ghost" size="sm" className="text-stone-500 text-xs h-6 px-2" onClick={() => setSelectedEntityId(null)} data-testid="button-back-to-list">
                        <ChevronLeft className="h-3 w-3 mr-1" /> Back
                      </Button>
                    </div>
                    <div className="flex items-center gap-3 mb-4">
                      {(() => {
                        const cfg = ENTITY_TYPE_CONFIG[selectedEntity.entityType];
                        const IconComp = cfg ? ICON_MAP[cfg.icon] || Search : Search;
                        return (
                          <>
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: cfg?.color + "22" }}>
                              <IconComp className="h-4 w-4" style={{ color: cfg?.color }} />
                            </div>
                            <div>
                              <h1 className="text-xl font-bold text-stone-100" data-testid="text-entity-name">{selectedEntity.displayName}</h1>
                              <Badge variant="outline" className="text-[9px] mt-0.5" style={{ borderColor: cfg?.color + "55", color: cfg?.color }}>{cfg?.label}</Badge>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                    {selectedEntity.image && (
                      <div className="mb-4 rounded-lg overflow-hidden border border-stone-800">
                        <img src={selectedEntity.image} alt={selectedEntity.displayName} className="w-full max-h-[400px] object-cover" />
                      </div>
                    )}
                    {selectedEntity.description && (
                      <p className="text-sm text-stone-400 italic mb-4 border-l-2 border-stone-700 pl-3">{selectedEntity.description}</p>
                    )}
                    {selectedEntity.tags && selectedEntity.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {selectedEntity.tags.map((tag, i) => (
                          <Badge key={i} variant="outline" className="text-[9px] border-stone-700 text-stone-500">{tag}</Badge>
                        ))}
                      </div>
                    )}
                    {selectedEntity.articleContent && (
                      <div className="prose prose-invert prose-sm max-w-none">
                        {renderArticleContent(selectedEntity.articleContent)}
                      </div>
                    )}
                    {entityLinks.filter(l => l.fromEntityId === selectedEntity.id || l.toEntityId === selectedEntity.id).length > 0 && (
                      <div className="mt-6 pt-4 border-t border-stone-800">
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
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center p-8 max-w-lg">
                    <Globe className="h-16 w-16 text-stone-800 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-stone-600 mb-2">Welcome to {data.campaignName}</h2>
                    <p className="text-stone-600 text-sm mb-6">Explore the world by selecting an article from the sidebar, or browse maps, timeline, and calendar.</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-sm mx-auto">
                      {Object.entries(ENTITY_TYPE_CONFIG).slice(0, 6).map(([key, cfg]) => {
                        const IconComp = ICON_MAP[cfg.icon] || Search;
                        const count = typeCounts[key] || 0;
                        if (count === 0) return null;
                        return (
                          <div key={key} className="flex flex-col items-center gap-1 p-3 rounded-lg bg-stone-900/50 border border-stone-800">
                            <IconComp className="h-5 w-5" style={{ color: cfg.color }} />
                            <span className="text-[10px] text-stone-500">{cfg.label}</span>
                            <span className="text-[10px] text-stone-600">{count}</span>
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
            <SharedMapViewer
              maps={maps}
              mapPins={mapPins}
              entities={entities}
              onNavigateToEntity={handleSelectEntity}
            />
          )}

          {activeSection === "timeline" && (
            <div className="flex-1 overflow-y-auto">
              <SharedTimelineView
                events={timelineEvents}
                entities={entities}
                calendars={calendars}
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
