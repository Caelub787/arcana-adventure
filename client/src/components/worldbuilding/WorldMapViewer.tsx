import React, { useState, useRef, useCallback, useEffect } from "react";
import { useWorldMaps, useWorldMapPins, useEntities, type WorldMap, type WorldMapPin, type Entity } from "@/lib/worldbuilding-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Map, MapPin, Plus, ChevronRight, ZoomIn, ZoomOut, Maximize2, Eye, Loader2, FileText, Navigation, Link2, X } from "lucide-react";

interface WorldMapViewerProps {
  campaignId?: string;
  worldId?: string;
  isGM: boolean;
  onEditMap?: (mapId: string) => void;
  onCreateMap?: () => void;
  onNavigateToEntity?: (entityId: string) => void;
}

export function WorldMapViewer({ campaignId, worldId, isGM, onEditMap, onCreateMap, onNavigateToEntity }: WorldMapViewerProps) {
  const resolvedId = worldId || campaignId;
  const { data: allMaps = [], isLoading } = useWorldMaps(resolvedId);
  const { data: entities = [] } = useEntities(resolvedId);
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [mapHistory, setMapHistory] = useState<string[]>([]);

  const visibleMaps = isGM ? allMaps : allMaps.filter(m => m.visibility !== "gm_only");
  const rootMaps = visibleMaps.filter(m => !m.parentMapId);
  const selectedMap = visibleMaps.find(m => m.id === selectedMapId);

  const handleSelectMap = (mapId: string) => {
    if (selectedMapId) {
      setMapHistory(prev => [...prev, selectedMapId]);
    }
    setSelectedMapId(mapId);
  };

  const handleNavigateToSubMap = (targetMapId: string) => {
    if (selectedMapId) {
      setMapHistory(prev => [...prev, selectedMapId]);
    }
    setSelectedMapId(targetMapId);
  };

  const handleBack = () => {
    if (mapHistory.length > 0) {
      const prev = mapHistory[mapHistory.length - 1];
      setMapHistory(h => h.slice(0, -1));
      setSelectedMapId(prev);
    } else {
      setSelectedMapId(null);
    }
  };

  const getBreadcrumbs = (): WorldMap[] => {
    if (!selectedMap) return [];
    const crumbs: WorldMap[] = [];
    let current: WorldMap | undefined = selectedMap;
    while (current) {
      crumbs.unshift(current);
      current = current.parentMapId ? visibleMaps.find(m => m.id === current!.parentMapId) : undefined;
    }
    return crumbs;
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-stone-500" />
      </div>
    );
  }

  if (!selectedMapId) {
    return (
      <MapListView
        maps={rootMaps}
        allMaps={visibleMaps}
        isGM={isGM}
        onSelectMap={handleSelectMap}
        onCreateMap={onCreateMap}
        onEditMap={onEditMap}
      />
    );
  }

  if (!selectedMap) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-stone-500">Map not found</p>
      </div>
    );
  }

  const breadcrumbs = getBreadcrumbs();
  const childMaps = visibleMaps.filter(m => m.parentMapId === selectedMapId);

  return (
    <div className="flex-1 flex flex-col h-full" data-testid="world-map-viewer">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-800 bg-stone-900/30 flex-shrink-0">
        <Button variant="ghost" size="sm" className="text-stone-400 hover:text-stone-200 h-7 text-xs" onClick={handleBack} data-testid="button-map-back">
          <ChevronRight className="h-3 w-3 rotate-180 mr-1" />
          Back
        </Button>
        <div className="flex items-center gap-1 text-xs text-stone-500 overflow-x-auto flex-1">
          <button onClick={() => { setSelectedMapId(null); setMapHistory([]); }} className="hover:text-amber-400 transition-colors flex-shrink-0" data-testid="breadcrumb-root">
            Maps
          </button>
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.id}>
              <ChevronRight className="h-3 w-3 flex-shrink-0" />
              <button
                onClick={() => {
                  if (idx < breadcrumbs.length - 1) {
                    setSelectedMapId(crumb.id);
                    setMapHistory(mapHistory.slice(0, idx));
                  }
                }}
                className={`truncate max-w-[120px] flex-shrink-0 ${idx === breadcrumbs.length - 1 ? 'text-amber-400' : 'hover:text-amber-400 transition-colors'}`}
                data-testid={`breadcrumb-${crumb.id}`}
              >
                {crumb.title}
              </button>
            </React.Fragment>
          ))}
        </div>
        {isGM && onEditMap && (
          <Button variant="ghost" size="sm" className="text-stone-400 hover:text-amber-400 h-7 text-xs flex-shrink-0" onClick={() => onEditMap(selectedMapId)} data-testid="button-edit-map">
            Edit
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        <MapCanvas
          campaignId={resolvedId}
          map={selectedMap}
          allMaps={visibleMaps}
          entities={entities}
          isGM={isGM}
          onNavigateToSubMap={handleNavigateToSubMap}
          onNavigateToEntity={onNavigateToEntity}
        />
      </div>

      {childMaps.length > 0 && (
        <div className="border-t border-stone-800 bg-stone-900/30 p-2 flex-shrink-0">
          <h4 className="text-[10px] text-stone-500 uppercase tracking-wider mb-1">Sub-maps</h4>
          <div className="flex gap-2 overflow-x-auto">
            {childMaps.map(child => (
              <button
                key={child.id}
                onClick={() => handleNavigateToSubMap(child.id)}
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 text-xs text-stone-300 hover:text-stone-100 transition-colors flex-shrink-0"
                data-testid={`submap-${child.id}`}
              >
                <Map className="h-3 w-3 text-amber-400" />
                {child.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MapListView({ maps, allMaps, isGM, onSelectMap, onCreateMap, onEditMap }: {
  maps: WorldMap[];
  allMaps: WorldMap[];
  isGM: boolean;
  onSelectMap: (id: string) => void;
  onCreateMap?: () => void;
  onEditMap?: (id: string) => void;
}) {
  const getChildCount = (mapId: string) => allMaps.filter(m => m.parentMapId === mapId).length;

  if (maps.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center p-8">
          <Map className="h-16 w-16 text-stone-800 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-stone-600 mb-2">No Maps Yet</h2>
          <p className="text-stone-600 text-sm mb-4">Create world maps with clickable pins that reveal text or open sub-maps.</p>
          {isGM && onCreateMap && (
            <Button onClick={onCreateMap} className="bg-amber-600 hover:bg-amber-500 text-white" data-testid="button-create-first-map">
              <Plus className="h-4 w-4 mr-2" /> Create Map
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-stone-200">World Maps</h2>
        {isGM && onCreateMap && (
          <Button onClick={onCreateMap} size="sm" className="bg-amber-600 hover:bg-amber-500 text-white h-8 text-xs" data-testid="button-create-map">
            <Plus className="h-3 w-3 mr-1" /> New Map
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {maps.map(map => (
          <button
            key={map.id}
            onClick={() => onSelectMap(map.id)}
            className="group text-left rounded-lg border border-stone-800 bg-stone-900/50 hover:bg-stone-800/50 hover:border-stone-700 transition-all overflow-hidden"
            data-testid={`map-card-${map.id}`}
          >
            {map.imageUrl ? (
              <div className="h-32 overflow-hidden">
                <img src={map.imageUrl} alt={map.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              </div>
            ) : (
              <div className="h-32 bg-stone-800/50 flex items-center justify-center">
                <Map className="h-10 w-10 text-stone-700" />
              </div>
            )}
            <div className="p-3">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-medium text-stone-200 group-hover:text-amber-400 transition-colors truncate">{map.title}</h3>
                {map.visibility === "gm_only" && (
                  <Badge variant="outline" className="text-[8px] border-red-500/30 text-red-400 ml-1 flex-shrink-0">GM</Badge>
                )}
              </div>
              {map.description && (
                <p className="text-[11px] text-stone-500 line-clamp-2">{map.description}</p>
              )}
              {getChildCount(map.id) > 0 && (
                <div className="mt-1.5 flex items-center gap-1 text-[10px] text-stone-600">
                  <Map className="h-2.5 w-2.5" />
                  {getChildCount(map.id)} sub-map{getChildCount(map.id) !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function MapCanvas({ campaignId, map, allMaps, entities, isGM, onNavigateToSubMap, onNavigateToEntity }: {
  campaignId: string;
  map: WorldMap;
  allMaps: WorldMap[];
  entities: Entity[];
  isGM: boolean;
  onNavigateToSubMap: (mapId: string) => void;
  onNavigateToEntity?: (entityId: string) => void;
}) {
  const { data: pins = [] } = useWorldMapPins(campaignId, map.id);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const initialFitRef = useRef<number>(1);

  const fitToScreen = useCallback(() => {
    if (!containerRef.current || !imgRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const iw = imgRef.current.naturalWidth;
    const ih = imgRef.current.naturalHeight;
    if (!iw || !ih) return;
    const scale = Math.min(cw / iw, ch / ih, 1);
    initialFitRef.current = scale;
    setZoom(scale);
    setPan({
      x: (cw - iw * scale) / 2,
      y: (ch - ih * scale) / 2,
    });
  }, []);

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
    fitToScreen();
  }, [fitToScreen]);

  useEffect(() => {
    setImageLoaded(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [map.id]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setZoom(prevZoom => {
      const newZoom = Math.min(Math.max(prevZoom * factor, 0.05), 10);
      const scale = newZoom / prevZoom;
      setPan(prevPan => ({
        x: mx - (mx - prevPan.x) * scale,
        y: my - (my - prevPan.y) * scale,
      }));
      return newZoom;
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const resetView = useCallback(() => {
    fitToScreen();
  }, [fitToScreen]);

  const handlePinClick = (pin: WorldMapPin, e: React.MouseEvent) => {
    e.stopPropagation();
    if (pin.pinType === "map_link" && pin.targetMapId) {
      onNavigateToSubMap(pin.targetMapId);
    } else if (pin.pinType === "entity_link" && pin.targetEntityId && onNavigateToEntity) {
      onNavigateToEntity(pin.targetEntityId);
    } else {
      setActivePinId(activePinId === pin.id ? null : pin.id);
    }
  };

  const getEntityName = (entityId: string) => {
    return entities.find(e => e.id === entityId)?.displayName || "Unknown Entity";
  };

  const getMapName = (mapId: string) => {
    return allMaps.find(m => m.id === mapId)?.title || "Unknown Map";
  };

  if (!map.imageUrl) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="text-center p-8">
          <Map className="h-12 w-12 text-stone-700 mx-auto mb-3" />
          <p className="text-stone-500 text-sm">No map image set</p>
          {isGM && <p className="text-stone-600 text-xs mt-1">Edit this map to add an image</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-stone-950" ref={containerRef}>
      <div
        className="absolute inset-0"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            position: 'relative',
            display: 'inline-block',
          }}
        >
          <img
            ref={imgRef}
            src={map.imageUrl}
            alt={map.title}
            className="max-w-none select-none"
            draggable={false}
            onLoad={handleImageLoad}
            style={{ opacity: imageLoaded ? 1 : 0 }}
            data-testid="map-image"
          />
          {pins.map(pin => {
            const pinScale = 1 / zoom;
            return (
            <div
              key={pin.id}
              className="absolute"
              style={{
                left: `${pin.x}%`,
                top: `${pin.y}%`,
                transform: 'translate(-50%, -100%)',
                zIndex: activePinId === pin.id ? 20 : 10,
              }}
            >
             <div style={{ transform: `scale(${pinScale})`, transformOrigin: 'bottom center' }}>
              <button
                onClick={(e) => handlePinClick(pin, e)}
                className="group relative flex flex-col items-center"
                data-testid={`map-pin-${pin.id}`}
                title={pin.label || undefined}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shadow-lg border-2 border-stone-900 hover:scale-110 transition-transform"
                  style={{ backgroundColor: pin.color || '#f59e0b' }}
                >
                  {pin.pinType === "map_link" ? (
                    <Navigation className="h-4 w-4 text-white" />
                  ) : pin.pinType === "entity_link" ? (
                    <Link2 className="h-4 w-4 text-white" />
                  ) : (
                    <FileText className="h-4 w-4 text-white" />
                  )}
                </div>
                {pin.label && (
                  <span className="mt-1 text-[11px] font-medium text-stone-200 bg-stone-900/90 px-1.5 py-0.5 rounded whitespace-nowrap shadow-md">
                    {pin.label}
                  </span>
                )}
              </button>
             </div>

              {activePinId === pin.id && pin.pinType === "text_reveal" && (
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-stone-800 border border-stone-700 rounded-lg shadow-xl p-3 z-30"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`pin-popover-${pin.id}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <h4 className="text-sm font-semibold text-stone-200">{pin.label || "Note"}</h4>
                    <button onClick={() => setActivePinId(null)} className="text-stone-500 hover:text-stone-300">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-xs text-stone-400 whitespace-pre-wrap leading-relaxed">{pin.textContent || "No content"}</p>
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-stone-800 border-r border-b border-stone-700 rotate-45" />
                </div>
              )}

              {activePinId === pin.id && pin.pinType === "map_link" && pin.targetMapId && (
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-stone-800 border border-stone-700 rounded-lg shadow-xl p-2 z-30"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => onNavigateToSubMap(pin.targetMapId!)}
                    className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 whitespace-nowrap"
                  >
                    <Map className="h-3 w-3" />
                    Go to {getMapName(pin.targetMapId)}
                  </button>
                </div>
              )}

              {activePinId === pin.id && pin.pinType === "entity_link" && pin.targetEntityId && (
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-stone-800 border border-stone-700 rounded-lg shadow-xl p-2 z-30"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => onNavigateToEntity?.(pin.targetEntityId!)}
                    className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 whitespace-nowrap"
                  >
                    <Link2 className="h-3 w-3" />
                    {getEntityName(pin.targetEntityId)}
                  </button>
                </div>
              )}
            </div>
          );
          })}
        </div>
      </div>

      <div className="absolute bottom-3 right-3 flex flex-col gap-1 z-20">
        <Button variant="ghost" size="icon" className="h-8 w-8 bg-stone-900/80 hover:bg-stone-800 text-stone-300 border border-stone-700" onClick={() => setZoom(z => Math.min(z * 1.2, 5))} data-testid="button-zoom-in">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 bg-stone-900/80 hover:bg-stone-800 text-stone-300 border border-stone-700" onClick={() => setZoom(z => Math.max(z * 0.8, 0.1))} data-testid="button-zoom-out">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 bg-stone-900/80 hover:bg-stone-800 text-stone-300 border border-stone-700" onClick={resetView} data-testid="button-reset-view">
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="absolute top-3 left-3 z-20">
        <Badge className="bg-stone-900/80 border-stone-700 text-stone-300 text-[10px]">
          {Math.round((zoom / initialFitRef.current) * 100)}%
        </Badge>
      </div>
    </div>
  );
}
