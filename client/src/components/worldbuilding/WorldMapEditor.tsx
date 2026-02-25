import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  useWorldMaps, useWorldMapPins, useEntities,
  useCreateWorldMap, useUpdateWorldMap, useDeleteWorldMap,
  useCreateWorldMapPin, useUpdateWorldMapPin, useDeleteWorldMapPin,
  type WorldMap, type WorldMapPin, type Entity,
} from "@/lib/worldbuilding-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Map, MapPin, Plus, Save, Trash2, X, Edit3, ChevronLeft, FileText, Navigation, Link2, GripVertical, Loader2, Image, Upload, ZoomIn, ZoomOut, Maximize2, PanelLeftClose, PanelLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

interface WorldMapEditorProps {
  campaignId?: string;
  worldId?: string;
  mapId?: string;
  onBack: () => void;
  onMapCreated?: (mapId: string) => void;
}

export function WorldMapEditor({ campaignId, worldId, mapId, onBack, onMapCreated }: WorldMapEditorProps) {
  const resolvedId = worldId || campaignId;
  const { data: allMaps = [] } = useWorldMaps(resolvedId);
  const { data: entities = [] } = useEntities(resolvedId);
  const { data: pins = [], isLoading: pinsLoading } = useWorldMapPins(resolvedId, mapId);

  const currentMap = allMaps.find(m => m.id === mapId);

  const createMap = useCreateWorldMap(resolvedId);
  const updateMap = useUpdateWorldMap(resolvedId);
  const deleteMap = useDeleteWorldMap(resolvedId);
  const createPin = useCreateWorldMapPin(resolvedId, mapId);
  const updatePin = useUpdateWorldMapPin(resolvedId, mapId);
  const deletePin = useDeleteWorldMapPin(resolvedId, mapId);

  const [title, setTitle] = useState(currentMap?.title || "");
  const [imageUrl, setImageUrl] = useState(currentMap?.imageUrl || "");
  const [description, setDescription] = useState(currentMap?.description || "");
  const [parentMapId, setParentMapId] = useState(currentMap?.parentMapId || "");
  const [visibility, setVisibility] = useState(currentMap?.visibility || "gm_only");
  const [isPlacingPin, setIsPlacingPin] = useState(false);
  const [editingPin, setEditingPin] = useState<WorldMapPin | null>(null);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinForm, setPinForm] = useState({
    label: "",
    pinType: "text_reveal" as string,
    textContent: "",
    color: "#f59e0b",
    targetMapId: "",
    targetEntityId: "",
    x: 0,
    y: 0,
  });
  useEffect(() => {
    if (currentMap) {
      setTitle(currentMap.title || "");
      setImageUrl(currentMap.imageUrl || "");
      setDescription(currentMap.description || "");
      setParentMapId(currentMap.parentMapId || "");
      setVisibility(currentMap.visibility || "gm_only");
    }
  }, [currentMap?.id, currentMap?.title, currentMap?.imageUrl, currentMap?.description, currentMap?.parentMapId, currentMap?.visibility]);

  const isMobile = useIsMobile();
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [draggingPinId, setDraggingPinId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const touchRef = useRef<{ lastDist: number; lastCenter: { x: number; y: number }; touching: boolean; moved: boolean; startPos: { x: number; y: number } }>({ lastDist: 0, lastCenter: { x: 0, y: 0 }, touching: false, moved: false, startPos: { x: 0, y: 0 } });

  const handleImageUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setUploadError("Please select an image file");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/upload/image", { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Upload failed (${res.status})`);
      }
      const { url } = await res.json();
      setImageUrl(url);
    } catch (e: any) {
      console.error("Image upload failed:", e);
      setUploadError(e.message || "Upload failed. The file may be too large or in an unsupported format.");
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      handleImageUpload(file);
    }
  }, [handleImageUpload]);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [editorZoom, setEditorZoom] = useState(1);
  const [editorPan, setEditorPan] = useState({ x: 0, y: 0 });
  const [editorDragging, setEditorDragging] = useState(false);
  const [editorDragStart, setEditorDragStart] = useState({ x: 0, y: 0 });
  const [editorImageLoaded, setEditorImageLoaded] = useState(false);
  const editorFitRef = useRef<number>(1);

  const fitEditorToScreen = useCallback(() => {
    if (!containerRef.current || !imageRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const iw = imageRef.current.naturalWidth;
    const ih = imageRef.current.naturalHeight;
    if (!iw || !ih) return;
    const scale = Math.min(cw / iw, ch / ih, 1);
    editorFitRef.current = scale;
    setEditorZoom(scale);
    setEditorPan({
      x: (cw - iw * scale) / 2,
      y: (ch - ih * scale) / 2,
    });
  }, []);

  const [editorImgNatSize, setEditorImgNatSize] = useState({ w: 0, h: 0 });

  const handleEditorImageLoad = useCallback(() => {
    setEditorImageLoaded(true);
    if (imageRef.current) {
      setEditorImgNatSize({ w: imageRef.current.naturalWidth, h: imageRef.current.naturalHeight });
    }
    fitEditorToScreen();
  }, [fitEditorToScreen]);

  const isNew = !mapId;

  const { toast } = useToast();

  const handleSaveMap = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      if (isNew) {
        const result = await createMap.mutateAsync({
          title: title.trim(),
          imageUrl: imageUrl || undefined,
          description: description || undefined,
          parentMapId: parentMapId || undefined,
          visibility,
        });
        onMapCreated?.(result.id);
        toast({ title: "Map created" });
      } else {
        await updateMap.mutateAsync({
          id: mapId,
          title: title.trim(),
          imageUrl: imageUrl || undefined,
          description: description || undefined,
          parentMapId: parentMapId || undefined,
          visibility,
        });
        toast({ title: "Map saved" });
      }
    } catch (err: any) {
      console.error("Map save failed:", err);
      toast({ title: "Failed to save map", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMap = async () => {
    if (!mapId) return;
    await deleteMap.mutateAsync(mapId);
    onBack();
  };

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPlacingPin || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPinForm(prev => ({ ...prev, x, y, label: "", pinType: "text_reveal", textContent: "", color: "#f59e0b", targetMapId: "", targetEntityId: "" }));
    setEditingPin(null);
    setShowPinDialog(true);
    setIsPlacingPin(false);
  };

  const handleEditPin = (pin: WorldMapPin) => {
    setEditingPin(pin);
    setPinForm({
      label: pin.label || "",
      pinType: pin.pinType,
      textContent: pin.textContent || "",
      color: pin.color || "#f59e0b",
      targetMapId: pin.targetMapId || "",
      targetEntityId: pin.targetEntityId || "",
      x: pin.x,
      y: pin.y,
    });
    setShowPinDialog(true);
  };

  const handleSavePin = async () => {
    const data: any = {
      mapId: mapId!,
      x: pinForm.x,
      y: pinForm.y,
      label: pinForm.label || undefined,
      pinType: pinForm.pinType,
      color: pinForm.color,
      textContent: pinForm.pinType === "text_reveal" ? pinForm.textContent : undefined,
      targetMapId: pinForm.pinType === "map_link" ? pinForm.targetMapId || undefined : undefined,
      targetEntityId: pinForm.pinType === "entity_link" ? pinForm.targetEntityId || undefined : undefined,
    };

    if (editingPin) {
      await updatePin.mutateAsync({ id: editingPin.id, ...data });
    } else {
      await createPin.mutateAsync(data);
    }
    setShowPinDialog(false);
    setEditingPin(null);
  };

  const handleDeletePin = async (pinId: string) => {
    await deletePin.mutateAsync(pinId);
    setShowPinDialog(false);
    setEditingPin(null);
  };

  const handlePinDragEnd = async (pinId: string, e: React.MouseEvent) => {
    if (!imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    await updatePin.mutateAsync({ id: pinId, x, y });
    setDraggingPinId(null);
  };

  const otherMaps = allMaps.filter(m => m.id !== mapId);

  return (
    <div className="flex-1 flex flex-col h-full" data-testid="world-map-editor">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-800 bg-stone-900/30 flex-shrink-0">
        <Button variant="ghost" size="sm" className="text-stone-400 hover:text-stone-200 h-7 text-xs" onClick={onBack} data-testid="button-editor-back">
          <ChevronLeft className="h-3 w-3 mr-1" /> Back
        </Button>
        <h2 className="text-sm font-medium text-stone-200 flex-1 truncate">{isNew ? "Create New Map" : `Editing: ${currentMap?.title}`}</h2>
        <div className="flex items-center gap-1.5">
          {!isNew && (
            <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 h-7 text-xs" onClick={() => setShowDeleteConfirm(true)} data-testid="button-delete-map">
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
          <Button size="sm" className="bg-amber-600 hover:bg-amber-500 text-white h-7 text-xs" onClick={handleSaveMap} disabled={saving || !title.trim()} data-testid="button-save-map">
            {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
            Save
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className={`${panelCollapsed ? 'hidden' : 'w-full md:w-72'} border-r border-stone-800 bg-stone-900/30 overflow-y-auto flex-shrink-0 p-3 space-y-3`}>
          <div>
            <Label className="text-[10px] text-stone-500 uppercase tracking-wider">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Map title..." className="mt-0.5 bg-stone-800 border-stone-700 text-stone-200 text-xs h-7" data-testid="input-map-title" />
          </div>

          <div>
            <Label className="text-[10px] text-stone-500 uppercase tracking-wider">Map Image</Label>
            <div className="flex gap-1.5 mt-0.5">
              <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Paste URL or upload..." className="bg-stone-800 border-stone-700 text-stone-200 text-xs h-7 flex-1" data-testid="input-map-image" />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file);
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 border-stone-700 text-stone-300 hover:bg-stone-700 hover:text-stone-100 text-xs"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                data-testid="button-upload-map-image"
              >
                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                <span className="ml-1 hidden md:inline">{uploading ? "Uploading..." : "Upload"}</span>
              </Button>
            </div>
            {uploadError && (
              <p className="text-[10px] text-red-400 mt-1" data-testid="text-upload-error">{uploadError}</p>
            )}
          </div>

          <div>
            <Label className="text-[10px] text-stone-500 uppercase tracking-wider">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Map description..." className="mt-0.5 bg-stone-800 border-stone-700 text-stone-200 text-xs min-h-[50px] resize-none" data-testid="input-map-description" />
          </div>

          <div>
            <Label className="text-[10px] text-stone-500 uppercase tracking-wider">Parent Map</Label>
            <Select value={parentMapId || "__none__"} onValueChange={(v) => setParentMapId(v === "__none__" ? "" : v)}>
              <SelectTrigger className="mt-0.5 bg-stone-800 border-stone-700 text-stone-200 h-7 text-xs" data-testid="select-parent-map">
                <SelectValue placeholder="None (root map)" />
              </SelectTrigger>
              <SelectContent className="bg-stone-800 border-stone-700">
                <SelectItem value="__none__" className="text-stone-400 text-xs">None (root map)</SelectItem>
                {otherMaps.map(m => (
                  <SelectItem key={m.id} value={m.id} className="text-stone-200 text-xs">{m.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[10px] text-stone-500 uppercase tracking-wider">Visibility</Label>
            <Select value={visibility} onValueChange={setVisibility}>
              <SelectTrigger className="mt-0.5 bg-stone-800 border-stone-700 text-stone-200 h-7 text-xs" data-testid="select-visibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-stone-800 border-stone-700">
                <SelectItem value="gm_only" className="text-stone-200 text-xs">GM Only</SelectItem>
                <SelectItem value="player_visible" className="text-stone-200 text-xs">Player Visible</SelectItem>
                <SelectItem value="shared" className="text-stone-200 text-xs">Shared</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!isNew && (
            <>
              <div className="border-t border-stone-700 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-[10px] text-stone-500 uppercase tracking-wider">Pins ({pins.length})</Label>
                  <Button
                    variant={isPlacingPin ? "default" : "ghost"}
                    size="sm"
                    className={`h-6 text-[10px] ${isPlacingPin ? 'bg-amber-600 text-white' : 'text-amber-400 hover:text-amber-300'}`}
                    onClick={() => {
                      const newVal = !isPlacingPin;
                      setIsPlacingPin(newVal);
                      if (newVal && isMobile) setPanelCollapsed(true);
                    }}
                    data-testid="button-place-pin"
                  >
                    <MapPin className="h-3 w-3 mr-1" />
                    {isPlacingPin ? "Tap on map..." : "Add Pin"}
                  </Button>
                </div>
                <div className="space-y-1">
                  {pins.map(pin => (
                    <div
                      key={pin.id}
                      className="flex items-center gap-1.5 px-2 py-1 rounded bg-stone-800/50 hover:bg-stone-800 group"
                    >
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: pin.color || '#f59e0b' }} />
                      <span className="text-[11px] text-stone-300 flex-1 truncate">{pin.label || `Pin (${pin.pinType})`}</span>
                      <Badge variant="outline" className="text-[8px] border-stone-600 text-stone-500 px-1 py-0 flex-shrink-0">
                        {pin.pinType === "text_reveal" ? "Text" : pin.pinType === "map_link" ? "Map" : "Entity"}
                      </Badge>
                      <button onClick={() => handleEditPin(pin)} className="opacity-0 group-hover:opacity-100 text-stone-500 hover:text-amber-400" data-testid={`button-edit-pin-${pin.id}`}>
                        <Edit3 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {pins.length === 0 && (
                    <p className="text-[10px] text-stone-600 text-center py-2">No pins yet. Click "Add Pin" then click on the map.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex-1 overflow-hidden bg-stone-950 relative" ref={containerRef}>
          {imageUrl ? (
            <>
            <div
              className={`absolute inset-0 ${isPlacingPin ? 'cursor-crosshair' : ''}`}
              style={{ cursor: isPlacingPin ? 'crosshair' : editorDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
              onWheel={(e) => {
                e.preventDefault();
                const factor = e.deltaY > 0 ? 0.9 : 1.1;
                const rect = containerRef.current?.getBoundingClientRect();
                if (!rect) return;
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                setEditorZoom(prevZoom => {
                  const newZoom = Math.min(Math.max(prevZoom * factor, 0.05), 10);
                  const scale = newZoom / prevZoom;
                  setEditorPan(prevPan => ({
                    x: mx - (mx - prevPan.x) * scale,
                    y: my - (my - prevPan.y) * scale,
                  }));
                  return newZoom;
                });
              }}
              onMouseDown={(e) => {
                if (isPlacingPin) return;
                if (e.button !== 0) return;
                setEditorDragging(true);
                setEditorDragStart({ x: e.clientX - editorPan.x, y: e.clientY - editorPan.y });
              }}
              onMouseMove={(e) => {
                if (!editorDragging) return;
                setEditorPan({ x: e.clientX - editorDragStart.x, y: e.clientY - editorDragStart.y });
              }}
              onMouseUp={() => setEditorDragging(false)}
              onMouseLeave={() => setEditorDragging(false)}
              onClick={isPlacingPin ? handleImageClick : undefined}
              onTouchStart={(e) => {
                if (e.touches.length === 2) {
                  const dx = e.touches[0].clientX - e.touches[1].clientX;
                  const dy = e.touches[0].clientY - e.touches[1].clientY;
                  touchRef.current.lastDist = Math.sqrt(dx * dx + dy * dy);
                  touchRef.current.lastCenter = {
                    x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                    y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
                  };
                  touchRef.current.touching = true;
                  touchRef.current.moved = true;
                } else if (e.touches.length === 1) {
                  touchRef.current.touching = true;
                  touchRef.current.moved = false;
                  touchRef.current.startPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                  setEditorDragging(true);
                  setEditorDragStart({ x: e.touches[0].clientX - editorPan.x, y: e.touches[0].clientY - editorPan.y });
                }
              }}
              onTouchMove={(e) => {
                if (e.touches.length === 2) {
                  e.preventDefault();
                  const dx = e.touches[0].clientX - e.touches[1].clientX;
                  const dy = e.touches[0].clientY - e.touches[1].clientY;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  const center = {
                    x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                    y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
                  };
                  if (touchRef.current.lastDist > 0) {
                    const factor = dist / touchRef.current.lastDist;
                    const rect = containerRef.current?.getBoundingClientRect();
                    if (rect) {
                      const mx = center.x - rect.left;
                      const my = center.y - rect.top;
                      setEditorZoom(prevZoom => {
                        const newZoom = Math.min(Math.max(prevZoom * factor, 0.05), 10);
                        const scale = newZoom / prevZoom;
                        setEditorPan(prevPan => ({
                          x: mx - (mx - prevPan.x) * scale,
                          y: my - (my - prevPan.y) * scale,
                        }));
                        return newZoom;
                      });
                    }
                    const panDx = center.x - touchRef.current.lastCenter.x;
                    const panDy = center.y - touchRef.current.lastCenter.y;
                    setEditorPan(prev => ({ x: prev.x + panDx, y: prev.y + panDy }));
                  }
                  touchRef.current.lastDist = dist;
                  touchRef.current.lastCenter = center;
                } else if (e.touches.length === 1) {
                  const dx = e.touches[0].clientX - touchRef.current.startPos.x;
                  const dy = e.touches[0].clientY - touchRef.current.startPos.y;
                  if (Math.abs(dx) > 5 || Math.abs(dy) > 5) touchRef.current.moved = true;
                  if (editorDragging) {
                    setEditorPan({ x: e.touches[0].clientX - editorDragStart.x, y: e.touches[0].clientY - editorDragStart.y });
                  }
                }
              }}
              onTouchEnd={(e) => {
                if (isPlacingPin && e.changedTouches.length === 1 && !touchRef.current.moved) {
                  const touch = e.changedTouches[0];
                  handleImageClick({ clientX: touch.clientX, clientY: touch.clientY, stopPropagation: () => {} } as any);
                }
                if (e.touches.length === 0) {
                  setEditorDragging(false);
                  touchRef.current.touching = false;
                  touchRef.current.lastDist = 0;
                }
              }}
            >
              <div
                style={{
                  transform: `translate(${editorPan.x}px, ${editorPan.y}px) scale(${editorZoom})`,
                  transformOrigin: '0 0',
                  position: 'relative',
                  display: 'inline-block',
                }}
              >
                <img
                  ref={imageRef}
                  src={imageUrl}
                  alt={title}
                  className="max-w-none select-none"
                  draggable={false}
                  onLoad={handleEditorImageLoad}
                  style={{ opacity: editorImageLoaded ? 1 : 0 }}
                  data-testid="editor-map-image"
                />
              </div>

              {isPlacingPin && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-amber-600/90 text-white px-3 py-1.5 rounded-full text-xs font-medium shadow-lg z-20 flex items-center gap-2">
                  <MapPin className="h-3 w-3" />
                  {isMobile ? "Tap on map to place pin" : "Click anywhere on the map to place a pin"}
                  <button onClick={() => setIsPlacingPin(false)} className="ml-1 hover:text-amber-200">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>

            {editorImageLoaded && editorImgNatSize.w > 0 && pins.map(pin => {
              const sx = editorPan.x + (pin.x / 100) * editorImgNatSize.w * editorZoom;
              const sy = editorPan.y + (pin.y / 100) * editorImgNatSize.h * editorZoom;
              return (
                <div
                  key={pin.id}
                  className="absolute pointer-events-none"
                  style={{
                    left: sx,
                    top: sy,
                    transform: 'translate(-50%, -100%)',
                    zIndex: 10,
                    cursor: draggingPinId === pin.id ? 'grabbing' : 'pointer',
                  }}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEditPin(pin); }}
                    className="flex flex-col items-center pointer-events-auto"
                    data-testid={`editor-pin-${pin.id}`}
                    draggable
                    onDragStart={() => setDraggingPinId(pin.id)}
                    onDragEnd={(e) => handlePinDragEnd(pin.id, e as any)}
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
              );
            })}

            <div className="absolute bottom-3 right-3 flex flex-col gap-1 z-20">
              <Button variant="ghost" size="icon" className="h-8 w-8 bg-stone-900/80 hover:bg-stone-800 text-stone-300 border border-stone-700" onClick={() => setEditorZoom(z => Math.min(z * 1.2, 10))} data-testid="button-editor-zoom-in">
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 bg-stone-900/80 hover:bg-stone-800 text-stone-300 border border-stone-700" onClick={() => setEditorZoom(z => Math.max(z * 0.8, 0.05))} data-testid="button-editor-zoom-out">
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 bg-stone-900/80 hover:bg-stone-800 text-stone-300 border border-stone-700" onClick={fitEditorToScreen} data-testid="button-editor-fit">
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 bg-stone-900/80 hover:bg-stone-800 text-stone-300 border border-stone-700"
                onClick={() => setPanelCollapsed(!panelCollapsed)}
                data-testid="button-toggle-panel"
              >
                {panelCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </Button>
              <Badge className="bg-stone-900/80 border-stone-700 text-stone-300 text-[10px]">
                {Math.round((editorZoom / editorFitRef.current) * 100)}%
              </Badge>
            </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center p-8">
                <Image className="h-12 w-12 text-stone-700 mx-auto mb-3" />
                <p className="text-stone-500 text-sm">Add an image URL or upload one in the settings panel</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
        <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 w-full max-w-[95vw] md:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-stone-100 text-base">{editingPin ? "Edit Pin" : "New Pin"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-[10px] text-stone-500 uppercase tracking-wider">Label</Label>
              <Input value={pinForm.label} onChange={(e) => setPinForm(p => ({ ...p, label: e.target.value }))} placeholder="Pin label..." className="mt-0.5 bg-stone-800 border-stone-700 text-stone-200 text-xs h-7" data-testid="input-pin-label" />
            </div>

            <div>
              <Label className="text-[10px] text-stone-500 uppercase tracking-wider">Pin Type</Label>
              <Select value={pinForm.pinType} onValueChange={(v) => setPinForm(p => ({ ...p, pinType: v }))}>
                <SelectTrigger className="mt-0.5 bg-stone-800 border-stone-700 text-stone-200 h-7 text-xs" data-testid="select-pin-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-stone-800 border-stone-700">
                  <SelectItem value="text_reveal" className="text-stone-200 text-xs">
                    <span className="flex items-center gap-1.5"><FileText className="h-3 w-3" /> Text Reveal</span>
                  </SelectItem>
                  <SelectItem value="map_link" className="text-stone-200 text-xs">
                    <span className="flex items-center gap-1.5"><Navigation className="h-3 w-3" /> Map Link</span>
                  </SelectItem>
                  <SelectItem value="entity_link" className="text-stone-200 text-xs">
                    <span className="flex items-center gap-1.5"><Link2 className="h-3 w-3" /> Entity Link</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[10px] text-stone-500 uppercase tracking-wider">Color</Label>
              <div className="flex items-center gap-2 mt-0.5">
                <input
                  type="color"
                  value={pinForm.color}
                  onChange={(e) => setPinForm(p => ({ ...p, color: e.target.value }))}
                  className="w-7 h-7 rounded cursor-pointer border border-stone-700 bg-transparent"
                  data-testid="input-pin-color"
                />
                <Input value={pinForm.color} onChange={(e) => setPinForm(p => ({ ...p, color: e.target.value }))} className="bg-stone-800 border-stone-700 text-stone-200 text-xs h-7 flex-1" />
              </div>
            </div>

            {pinForm.pinType === "text_reveal" && (
              <div>
                <Label className="text-[10px] text-stone-500 uppercase tracking-wider">Text Content</Label>
                <Textarea value={pinForm.textContent} onChange={(e) => setPinForm(p => ({ ...p, textContent: e.target.value }))} placeholder="Content revealed when pin is clicked..." className="mt-0.5 bg-stone-800 border-stone-700 text-stone-200 text-xs min-h-[80px] resize-none" data-testid="input-pin-text" />
              </div>
            )}

            {pinForm.pinType === "map_link" && (
              <div>
                <Label className="text-[10px] text-stone-500 uppercase tracking-wider">Target Map</Label>
                <Select value={pinForm.targetMapId || "__none__"} onValueChange={(v) => setPinForm(p => ({ ...p, targetMapId: v === "__none__" ? "" : v }))}>
                  <SelectTrigger className="mt-0.5 bg-stone-800 border-stone-700 text-stone-200 h-7 text-xs" data-testid="select-target-map">
                    <SelectValue placeholder="Select a map..." />
                  </SelectTrigger>
                  <SelectContent className="bg-stone-800 border-stone-700">
                    <SelectItem value="__none__" className="text-stone-400 text-xs">Select a map...</SelectItem>
                    {otherMaps.map(m => (
                      <SelectItem key={m.id} value={m.id} className="text-stone-200 text-xs">{m.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {pinForm.pinType === "entity_link" && (
              <div>
                <Label className="text-[10px] text-stone-500 uppercase tracking-wider">Target Entity</Label>
                <Select value={pinForm.targetEntityId || "__none__"} onValueChange={(v) => setPinForm(p => ({ ...p, targetEntityId: v === "__none__" ? "" : v }))}>
                  <SelectTrigger className="mt-0.5 bg-stone-800 border-stone-700 text-stone-200 h-7 text-xs" data-testid="select-target-entity">
                    <SelectValue placeholder="Select an entity..." />
                  </SelectTrigger>
                  <SelectContent className="bg-stone-800 border-stone-700 max-h-48">
                    <SelectItem value="__none__" className="text-stone-400 text-xs">Select an entity...</SelectItem>
                    {entities.map(e => (
                      <SelectItem key={e.id} value={e.id} className="text-stone-200 text-xs">{e.displayName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2">
            {editingPin && (
              <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 h-7 text-xs mr-auto" onClick={() => handleDeletePin(editingPin.id)} data-testid="button-delete-pin">
                <Trash2 className="h-3 w-3 mr-1" /> Delete Pin
              </Button>
            )}
            <Button variant="ghost" size="sm" className="text-stone-400 h-7 text-xs" onClick={() => setShowPinDialog(false)}>Cancel</Button>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-500 text-white h-7 text-xs" onClick={handleSavePin} data-testid="button-save-pin">
              <Save className="h-3 w-3 mr-1" /> {editingPin ? "Update" : "Create"} Pin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-stone-100">Delete Map?</DialogTitle>
          </DialogHeader>
          <p className="text-stone-400 text-sm">This will permanently delete "{currentMap?.title}" and all its pins. This cannot be undone.</p>
          <DialogFooter>
            <Button variant="ghost" size="sm" className="text-stone-400 h-7 text-xs" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-500 text-white h-7 text-xs" onClick={handleDeleteMap} data-testid="button-confirm-delete-map">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
