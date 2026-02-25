import React, { useMemo, useState } from "react";
import {
  type Entity,
  type WorldTimelineEvent,
  type WorldTimeline,
  type WorldCalendar,
  ENTITY_TYPE_CONFIG,
  useTimelines,
  useCreateTimeline,
  useUpdateTimeline,
  useDeleteTimeline,
  useTimelineEvents,
  useCreateTimelineEvent,
  useUpdateTimelineEvent,
  useDeleteTimelineEvent,
  useCalendars,
  useEntities,
} from "@/lib/worldbuilding-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Clock, Calendar, ChevronRight, Plus, Edit2, Trash2, Link2, Eye, EyeOff, Loader2, BookOpen, Settings } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TimelineViewProps {
  campaignId?: string;
  worldId?: string;
  isGM: boolean;
  onSelectEntity?: (entityId: string) => void;
}

const DEFAULT_COLORS = [
  "#e57373", "#81c784", "#64b5f6", "#ffb74d", "#ce93d8",
  "#a1887f", "#4db6ac", "#ef5350", "#7986cb", "#ba68c8",
  "#90a4ae", "#fff176",
];

const TIMELINE_COLORS = [
  "#64b5f6", "#81c784", "#ce93d8", "#ffb74d", "#e57373",
  "#4db6ac", "#a1887f", "#7986cb", "#ba68c8", "#90a4ae",
];

function getEraColor(era: string, customColor?: string | null): string {
  if (customColor) return customColor;
  return DEFAULT_COLORS[Math.abs(hashString(era)) % DEFAULT_COLORS.length];
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}

interface EventFormData {
  title: string;
  description: string;
  date: string;
  endDate: string;
  era: string;
  entityId: string;
  calendarId: string;
  color: string;
  visibility: string;
}

const EMPTY_FORM: EventFormData = {
  title: "",
  description: "",
  date: "",
  endDate: "",
  era: "",
  entityId: "",
  calendarId: "",
  color: "",
  visibility: "gm_only",
};

export function TimelineView({ campaignId, worldId, isGM, onSelectEntity }: TimelineViewProps) {
  const resolvedId = worldId || campaignId;
  const { data: timelines = [], isLoading: timelinesLoading } = useTimelines(resolvedId);
  const { data: allEvents = [], isLoading: eventsLoading } = useTimelineEvents(resolvedId);
  const { data: entities = [] } = useEntities(resolvedId);
  const { data: calendars = [] } = useCalendars(resolvedId);
  const createTimeline = useCreateTimeline(resolvedId);
  const updateTimeline = useUpdateTimeline(resolvedId);
  const deleteTimeline = useDeleteTimeline(resolvedId);
  const createEvent = useCreateTimelineEvent(resolvedId);
  const updateEvent = useUpdateTimelineEvent(resolvedId);
  const deleteEvent = useDeleteTimelineEvent(resolvedId);

  const [selectedTimelineId, setSelectedTimelineId] = useState<string | null>(null);
  const [showTimelineForm, setShowTimelineForm] = useState(false);
  const [editingTimeline, setEditingTimeline] = useState<WorldTimeline | null>(null);
  const [timelineName, setTimelineName] = useState("");
  const [timelineDescription, setTimelineDescription] = useState("");
  const [timelineColor, setTimelineColor] = useState("");
  const [timelineVisibility, setTimelineVisibility] = useState("gm_only");
  const [deleteTimelineConfirm, setDeleteTimelineConfirm] = useState<string | null>(null);

  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<WorldTimelineEvent | null>(null);
  const [formData, setFormData] = useState<EventFormData>(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const isLoading = timelinesLoading || eventsLoading;

  const selectedTimeline = useMemo(() => {
    if (selectedTimelineId) return timelines.find(t => t.id === selectedTimelineId) || null;
    return timelines.length > 0 ? timelines[0] : null;
  }, [timelines, selectedTimelineId]);

  const currentTimelineId = selectedTimeline?.id || null;

  const filteredEvents = useMemo(() => {
    if (!currentTimelineId) return allEvents.filter(e => !e.timelineId);
    return allEvents.filter(e => e.timelineId === currentTimelineId);
  }, [allEvents, currentTimelineId]);

  const groupedByEra = useMemo(() => {
    const groups: Record<string, WorldTimelineEvent[]> = {};
    const sorted = [...filteredEvents].sort((a, b) => {
      if (a.era !== b.era) return (a.era || "").localeCompare(b.era || "");
      if (a.date && b.date) return a.date.localeCompare(b.date);
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    sorted.forEach(event => {
      const era = event.era || "Unclassified";
      if (!groups[era]) groups[era] = [];
      groups[era].push(event);
    });
    return Object.entries(groups);
  }, [filteredEvents]);

  const entityMap = useMemo(() => {
    const map: Record<string, Entity> = {};
    entities.forEach(e => { map[e.id] = e; });
    return map;
  }, [entities]);

  const calendarMap = useMemo(() => {
    const map: Record<string, WorldCalendar> = {};
    calendars.forEach(c => { map[c.id] = c; });
    return map;
  }, [calendars]);

  const existingEras = useMemo(() => {
    const eras = new Set<string>();
    filteredEvents.forEach(e => { if (e.era) eras.add(e.era); });
    return Array.from(eras);
  }, [filteredEvents]);

  const unassignedCount = useMemo(() => {
    return allEvents.filter(e => !e.timelineId).length;
  }, [allEvents]);

  const openCreateTimeline = () => {
    setEditingTimeline(null);
    setTimelineName("");
    setTimelineDescription("");
    setTimelineColor(TIMELINE_COLORS[timelines.length % TIMELINE_COLORS.length]);
    setTimelineVisibility("gm_only");
    setShowTimelineForm(true);
  };

  const openEditTimeline = (tl: WorldTimeline) => {
    setEditingTimeline(tl);
    setTimelineName(tl.name);
    setTimelineDescription(tl.description || "");
    setTimelineColor(tl.color || "");
    setTimelineVisibility(tl.visibility);
    setShowTimelineForm(true);
  };

  const handleSaveTimeline = async () => {
    if (!timelineName.trim()) return;
    const payload = {
      name: timelineName.trim(),
      description: timelineDescription.trim() || null,
      color: timelineColor || null,
      visibility: timelineVisibility,
    };
    if (editingTimeline) {
      await updateTimeline.mutateAsync({ id: editingTimeline.id, ...payload });
    } else {
      const created = await createTimeline.mutateAsync(payload);
      setSelectedTimelineId(created.id);
    }
    setShowTimelineForm(false);
  };

  const handleDeleteTimeline = async (id: string) => {
    await deleteTimeline.mutateAsync(id);
    if (selectedTimelineId === id) setSelectedTimelineId(null);
    setDeleteTimelineConfirm(null);
  };

  const openCreateEvent = () => {
    setEditingEvent(null);
    setFormData(EMPTY_FORM);
    setShowEventForm(true);
  };

  const openEditEvent = (event: WorldTimelineEvent) => {
    setEditingEvent(event);
    setFormData({
      title: event.title,
      description: event.description || "",
      date: event.date || "",
      endDate: event.endDate || "",
      era: event.era || "",
      entityId: event.entityId || "",
      calendarId: event.calendarId || "",
      color: event.color || "",
      visibility: event.visibility,
    });
    setShowEventForm(true);
  };

  const handleSubmitEvent = async () => {
    if (!formData.title.trim()) return;
    const payload: any = {
      title: formData.title.trim(),
      description: formData.description.trim() || null,
      date: formData.date.trim() || null,
      endDate: formData.endDate.trim() || null,
      era: formData.era.trim() || null,
      entityId: formData.entityId || null,
      calendarId: formData.calendarId || null,
      color: formData.color || null,
      visibility: formData.visibility,
      timelineId: currentTimelineId,
    };
    if (editingEvent) {
      await updateEvent.mutateAsync({ id: editingEvent.id, ...payload });
    } else {
      await createEvent.mutateAsync(payload);
    }
    setShowEventForm(false);
    setEditingEvent(null);
  };

  const handleDeleteEvent = async (eventId: string) => {
    await deleteEvent.mutateAsync(eventId);
    setDeleteConfirm(null);
  };

  const formatCalendarDate = (dateStr: string, calendarId?: string | null): string => {
    if (!calendarId || !calendarMap[calendarId]) return dateStr;
    const cal = calendarMap[calendarId];
    const parts = dateStr.split(/[-/]/);
    if (parts.length >= 2) {
      const monthIdx = parseInt(parts[0], 10) - 1;
      const day = parts[1];
      const monthName = (cal.monthNames as string[])?.[monthIdx];
      if (monthName) {
        const suffix = cal.yearSuffix || "";
        if (parts.length >= 3) {
          return `${day} ${monthName}, ${parts[2]}${suffix}`;
        }
        return `${day} ${monthName}`;
      }
    }
    return dateStr;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="timeline-loading">
        <Loader2 className="h-8 w-8 animate-spin text-stone-600" />
      </div>
    );
  }

  return (
    <div className="flex h-full" data-testid="timeline-view">
      <div className="w-56 flex-shrink-0 border-r border-stone-700 bg-stone-900/50 flex flex-col">
        <div className="p-3 border-b border-stone-700">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Timelines</h3>
            {isGM && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-stone-500 hover:text-amber-400"
                onClick={openCreateTimeline}
                data-testid="button-create-timeline"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {timelines.map(tl => {
              const isSelected = currentTimelineId === tl.id;
              const tlColor = tl.color || "#64b5f6";
              const eventCount = allEvents.filter(e => e.timelineId === tl.id).length;
              return (
                <div
                  key={tl.id}
                  className={`group flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer transition-all ${
                    isSelected
                      ? "bg-stone-700/60 text-stone-100"
                      : "text-stone-400 hover:bg-stone-800 hover:text-stone-200"
                  }`}
                  onClick={() => setSelectedTimelineId(tl.id)}
                  data-testid={`timeline-item-${tl.id}`}
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: tlColor }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{tl.name}</div>
                    <div className="text-[10px] text-stone-500">{eventCount} events</div>
                  </div>
                  {isGM && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-stone-500 hover:text-stone-200"
                        onClick={(e) => { e.stopPropagation(); openEditTimeline(tl); }}
                        data-testid={`button-edit-timeline-${tl.id}`}
                      >
                        <Settings className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-stone-500 hover:text-red-400"
                        onClick={(e) => { e.stopPropagation(); setDeleteTimelineConfirm(tl.id); }}
                        data-testid={`button-delete-timeline-${tl.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}

            {unassignedCount > 0 && (
              <div
                className={`flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer transition-all ${
                  currentTimelineId === null && timelines.length > 0
                    ? "bg-stone-700/60 text-stone-100"
                    : "text-stone-500 hover:bg-stone-800 hover:text-stone-300"
                }`}
                onClick={() => setSelectedTimelineId(null)}
                data-testid="timeline-unassigned"
              >
                <Clock className="h-3 w-3 flex-shrink-0 opacity-50" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium">Unassigned</div>
                  <div className="text-[10px] text-stone-500">{unassignedCount} events</div>
                </div>
              </div>
            )}

            {timelines.length === 0 && (
              <div className="px-3 py-6 text-center">
                <BookOpen className="h-8 w-8 text-stone-700 mx-auto mb-2" />
                <p className="text-[11px] text-stone-500 mb-3">No timelines yet</p>
                {isGM && (
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-500 text-white text-xs h-7"
                    onClick={openCreateTimeline}
                    data-testid="button-create-first-timeline"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Create Timeline
                  </Button>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 overflow-y-auto">
        {selectedTimeline ? (
          <div className="p-3 md:p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: selectedTimeline.color || "#64b5f6" }}
                />
                <div>
                  <h2 className="text-lg font-semibold text-stone-200" data-testid="text-timeline-title">{selectedTimeline.name}</h2>
                  {selectedTimeline.description && (
                    <p className="text-xs text-stone-400 mt-0.5">{selectedTimeline.description}</p>
                  )}
                </div>
              </div>
              {isGM && (
                <Button onClick={openCreateEvent} size="sm" className="bg-amber-600 hover:bg-amber-500 text-white" data-testid="button-add-event">
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Event
                </Button>
              )}
            </div>

            {filteredEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-stone-500">
                <Clock className="h-12 w-12 mb-4 opacity-30" />
                <p className="text-sm">No events in this timeline</p>
                <p className="text-xs mt-1 mb-4">Add events to build this timeline's history</p>
                {isGM && (
                  <Button onClick={openCreateEvent} className="bg-amber-600 hover:bg-amber-500 text-white" data-testid="button-create-first-event">
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Event
                  </Button>
                )}
              </div>
            ) : (
              <TimelineEventList
                groupedByEra={groupedByEra}
                entityMap={entityMap}
                calendarMap={calendarMap}
                formatCalendarDate={formatCalendarDate}
                isGM={isGM}
                onEdit={openEditEvent}
                onDelete={setDeleteConfirm}
                onSelectEntity={onSelectEntity}
              />
            )}
          </div>
        ) : timelines.length === 0 && unassignedCount === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-stone-500">
            <Clock className="h-16 w-16 mb-4 opacity-20" />
            <p className="text-sm font-medium">Build Your World's History</p>
            <p className="text-xs mt-1 max-w-xs text-center">Create timelines to organize your world's events into distinct historical threads.</p>
          </div>
        ) : (
          <div className="p-3 md:p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-stone-200">Unassigned Events</h2>
              {isGM && (
                <Button onClick={openCreateEvent} size="sm" className="bg-amber-600 hover:bg-amber-500 text-white" data-testid="button-add-event">
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Event
                </Button>
              )}
            </div>
            {filteredEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-stone-500">
                <Clock className="h-12 w-12 mb-4 opacity-30" />
                <p className="text-sm">No unassigned events</p>
              </div>
            ) : (
              <TimelineEventList
                groupedByEra={groupedByEra}
                entityMap={entityMap}
                calendarMap={calendarMap}
                formatCalendarDate={formatCalendarDate}
                isGM={isGM}
                onEdit={openEditEvent}
                onDelete={setDeleteConfirm}
                onSelectEntity={onSelectEntity}
              />
            )}
          </div>
        )}
      </div>

      <Dialog open={showTimelineForm} onOpenChange={setShowTimelineForm}>
        <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 w-full max-w-[95vw] md:max-w-lg" data-testid="timeline-form-dialog">
          <DialogHeader>
            <DialogTitle className="text-stone-100">
              {editingTimeline ? "Edit Timeline" : "Create Timeline"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-stone-400 mb-1 block">Name *</label>
              <Input
                value={timelineName}
                onChange={(e) => setTimelineName(e.target.value)}
                placeholder="e.g. History of the Realm"
                className="bg-stone-800 border-stone-700 text-stone-200"
                data-testid="input-timeline-name"
              />
            </div>
            <div>
              <label className="text-xs text-stone-400 mb-1 block">Description</label>
              <Textarea
                value={timelineDescription}
                onChange={(e) => setTimelineDescription(e.target.value)}
                placeholder="What this timeline covers..."
                className="bg-stone-800 border-stone-700 text-stone-200 min-h-[60px]"
                data-testid="input-timeline-description"
              />
            </div>
            <div>
              <label className="text-xs text-stone-400 mb-1 block">Color</label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={timelineColor || "#64b5f6"}
                  onChange={(e) => setTimelineColor(e.target.value)}
                  className="w-8 h-8 p-0 border-0 bg-transparent cursor-pointer"
                  data-testid="input-timeline-color"
                />
                <div className="flex gap-1 flex-wrap flex-1">
                  {TIMELINE_COLORS.map(c => (
                    <button
                      key={c}
                      className={`w-5 h-5 rounded-full border-2 transition-all ${timelineColor === c ? 'border-white scale-110' : 'border-transparent hover:border-stone-500'}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setTimelineColor(c)}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs text-stone-400 mb-1 block">Visibility</label>
              <Select value={timelineVisibility} onValueChange={setTimelineVisibility}>
                <SelectTrigger className="bg-stone-800 border-stone-700 text-stone-200" data-testid="select-timeline-visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-stone-800 border-stone-700">
                  <SelectItem value="gm_only" className="text-stone-200">
                    <div className="flex items-center gap-2">
                      <EyeOff className="h-3 w-3 text-red-400" />
                      GM Only
                    </div>
                  </SelectItem>
                  <SelectItem value="player_visible" className="text-stone-200">
                    <div className="flex items-center gap-2">
                      <Eye className="h-3 w-3 text-green-400" />
                      Player Visible
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="text-stone-400" onClick={() => setShowTimelineForm(false)}>Cancel</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-500 text-white"
              onClick={handleSaveTimeline}
              disabled={!timelineName.trim() || createTimeline.isPending || updateTimeline.isPending}
              data-testid="button-save-timeline"
            >
              {(createTimeline.isPending || updateTimeline.isPending) && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {editingTimeline ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTimelineConfirm} onOpenChange={() => setDeleteTimelineConfirm(null)}>
        <AlertDialogContent className="bg-stone-900 border-stone-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-stone-200">Delete Timeline</AlertDialogTitle>
            <AlertDialogDescription className="text-stone-400">
              This will permanently delete this timeline and all its events. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-stone-800 border-stone-700 text-stone-300 hover:bg-stone-700">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-500 text-white"
              onClick={() => deleteTimelineConfirm && handleDeleteTimeline(deleteTimelineConfirm)}
              data-testid="button-confirm-delete-timeline"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showEventForm && (
        <EventFormDialog
          open={showEventForm}
          onClose={() => { setShowEventForm(false); setEditingEvent(null); }}
          formData={formData}
          setFormData={setFormData}
          onSubmit={handleSubmitEvent}
          isEditing={!!editingEvent}
          entities={entities}
          calendars={calendars}
          existingEras={existingEras}
          isSubmitting={createEvent.isPending || updateEvent.isPending}
        />
      )}

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="bg-stone-900 border-stone-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-stone-200">Delete Timeline Event</AlertDialogTitle>
            <AlertDialogDescription className="text-stone-400">
              This will permanently remove this event from the timeline. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-stone-800 border-stone-700 text-stone-300 hover:bg-stone-700" data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-500 text-white"
              onClick={() => deleteConfirm && handleDeleteEvent(deleteConfirm)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TimelineEventList({
  groupedByEra,
  entityMap,
  calendarMap,
  formatCalendarDate,
  isGM,
  onEdit,
  onDelete,
  onSelectEntity,
}: {
  groupedByEra: [string, WorldTimelineEvent[]][];
  entityMap: Record<string, Entity>;
  calendarMap: Record<string, WorldCalendar>;
  formatCalendarDate: (dateStr: string, calendarId?: string | null) => string;
  isGM: boolean;
  onEdit: (event: WorldTimelineEvent) => void;
  onDelete: (eventId: string) => void;
  onSelectEntity?: (entityId: string) => void;
}) {
  return (
    <>
      {groupedByEra.map(([era, eraEvents]) => {
        const eraColor = getEraColor(era, eraEvents[0]?.color);
        return (
          <div key={era} className="mb-8" data-testid={`timeline-era-${era}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1" style={{ backgroundColor: eraColor + "44" }} />
              <h3
                className="text-sm font-semibold uppercase tracking-wider px-3 py-1 rounded-full border"
                style={{ color: eraColor, backgroundColor: eraColor + "15", borderColor: eraColor + "33" }}
              >
                {era}
              </h3>
              <div className="h-px flex-1" style={{ backgroundColor: eraColor + "44" }} />
            </div>

            <div className="relative pl-8">
              <div className="absolute left-3 top-0 bottom-0 w-0.5" style={{ backgroundColor: eraColor + "44" }} />

              {eraEvents.map((event) => {
                const eventColor = event.color || eraColor;
                const linkedEntity = event.entityId ? entityMap[event.entityId] : null;
                const linkedEntityCfg = linkedEntity ? ENTITY_TYPE_CONFIG[linkedEntity.entityType] : null;
                const displayDate = event.date ? formatCalendarDate(event.date, event.calendarId) : null;
                const displayEndDate = event.endDate ? formatCalendarDate(event.endDate, event.calendarId) : null;

                return (
                  <div key={event.id} className="relative mb-4 last:mb-0" data-testid={`timeline-event-${event.id}`}>
                    <div
                      className="absolute left-[-22px] top-3 w-3 h-3 rounded-full border-2"
                      style={{ backgroundColor: eventColor, borderColor: eventColor + "88" }}
                    />

                    <div className="bg-stone-900/60 border border-stone-700 rounded-lg p-3 md:p-4 hover:border-stone-600 hover:bg-stone-800/60 transition-all group">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            {displayDate && (
                              <Badge variant="outline" className="text-[10px] border-stone-600 text-stone-400" data-testid={`event-date-${event.id}`}>
                                <Calendar className="h-2.5 w-2.5 mr-1" />
                                {displayDate}
                                {displayEndDate && ` — ${displayEndDate}`}
                              </Badge>
                            )}
                            {event.visibility === "gm_only" && isGM && (
                              <Badge variant="outline" className="text-[10px] border-red-800/50 text-red-400">
                                <EyeOff className="h-2.5 w-2.5 mr-1" />
                                GM Only
                              </Badge>
                            )}
                            {event.visibility === "player_visible" && isGM && (
                              <Badge variant="outline" className="text-[10px] border-green-800/50 text-green-400">
                                <Eye className="h-2.5 w-2.5 mr-1" />
                                Visible
                              </Badge>
                            )}
                          </div>
                          <h4 className="text-sm font-medium text-stone-200">
                            {event.title}
                          </h4>
                          {event.description && (
                            <p className="text-xs text-stone-400 mt-1 whitespace-pre-wrap">{event.description}</p>
                          )}
                          {linkedEntity && (
                            <button
                              onClick={() => onSelectEntity?.(linkedEntity.id)}
                              className="flex items-center gap-1.5 mt-2 text-[11px] hover:text-amber-400 transition-colors"
                              style={{ color: linkedEntityCfg?.color || "#999" }}
                              data-testid={`event-entity-link-${event.id}`}
                            >
                              <Link2 className="h-3 w-3" />
                              <span>{linkedEntity.displayName}</span>
                              <ChevronRight className="h-3 w-3 opacity-50" />
                            </button>
                          )}
                        </div>
                        {isGM && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-stone-500 hover:text-stone-200"
                              onClick={() => onEdit(event)}
                              data-testid={`button-edit-event-${event.id}`}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-stone-500 hover:text-red-400"
                              onClick={() => onDelete(event.id)}
                              data-testid={`button-delete-event-${event.id}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

function CalendarDatePicker({ value, calendar, onChange, testIdPrefix }: {
  value: string;
  calendar: WorldCalendar;
  onChange: (v: string) => void;
  testIdPrefix: string;
}) {
  const monthNames = (calendar.monthNames as string[]) || [];
  const daysPerMonth = (calendar.daysPerMonth as number[]) || [];

  const parts = value ? value.split("-") : [];
  const month = parts.length >= 1 ? parseInt(parts[0], 10) : 0;
  const day = parts.length >= 2 ? parseInt(parts[1], 10) : 0;
  const year = parts.length >= 3 ? parseInt(parts[2], 10) : 0;

  const buildDate = (m: number, d: number, y: number) => {
    if (m <= 0 && d <= 0 && y <= 0) return "";
    if (y > 0) return `${m}-${d}-${y}`;
    if (m > 0 && d > 0) return `${m}-${d}`;
    return "";
  };

  const maxDay = month > 0 && month <= daysPerMonth.length ? daysPerMonth[month - 1] : 31;

  return (
    <div className="grid grid-cols-3 gap-2">
      <div>
        <Select
          value={month > 0 ? String(month) : "0"}
          onValueChange={(v) => {
            const m = parseInt(v, 10);
            const newMax = m > 0 && m <= daysPerMonth.length ? daysPerMonth[m - 1] : 31;
            const d = day > newMax ? newMax : day;
            onChange(buildDate(m, d || 1, year));
          }}
        >
          <SelectTrigger className="bg-stone-800 border-stone-700 text-stone-200 text-xs" data-testid={`${testIdPrefix}-month`}>
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent className="bg-stone-800 border-stone-700 max-h-60">
            <SelectItem value="0" className="text-stone-500 text-xs">No month</SelectItem>
            {monthNames.map((name, i) => (
              <SelectItem key={i} value={String(i + 1)} className="text-stone-200 text-xs">
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Input
          type="number"
          min={1}
          max={maxDay}
          value={day || ""}
          onChange={(e) => {
            const d = Math.max(0, Math.min(maxDay, parseInt(e.target.value) || 0));
            onChange(buildDate(month || 1, d, year));
          }}
          placeholder="Day"
          className="bg-stone-800 border-stone-700 text-stone-200 text-xs"
          data-testid={`${testIdPrefix}-day`}
        />
      </div>
      <div>
        <Input
          type="number"
          value={year || ""}
          onChange={(e) => {
            const y = parseInt(e.target.value) || 0;
            onChange(buildDate(month || 1, day || 1, y));
          }}
          placeholder="Year"
          className="bg-stone-800 border-stone-700 text-stone-200 text-xs"
          data-testid={`${testIdPrefix}-year`}
        />
      </div>
    </div>
  );
}

interface EventFormDialogProps {
  open: boolean;
  onClose: () => void;
  formData: EventFormData;
  setFormData: React.Dispatch<React.SetStateAction<EventFormData>>;
  onSubmit: () => Promise<void>;
  isEditing: boolean;
  entities: Entity[];
  calendars: WorldCalendar[];
  existingEras: string[];
  isSubmitting: boolean;
}

function EventFormDialog({ open, onClose, formData, setFormData, onSubmit, isEditing, entities, calendars, existingEras, isSubmitting }: EventFormDialogProps) {
  const [entitySearch, setEntitySearch] = useState("");
  const selectedCalendar = calendars.find(c => c.id === formData.calendarId);

  const filteredEntities = useMemo(() => {
    if (!entitySearch) return entities.slice(0, 20);
    const q = entitySearch.toLowerCase();
    return entities.filter(e => e.displayName.toLowerCase().includes(q)).slice(0, 20);
  }, [entities, entitySearch]);

  const selectedEntity = entities.find(e => e.id === formData.entityId);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-stone-900 border-stone-700 w-full max-w-[95vw] md:max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="timeline-event-form">
        <DialogHeader>
          <DialogTitle className="text-stone-200">
            {isEditing ? "Edit Timeline Event" : "Create Timeline Event"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          <div className="space-y-3">
            <div>
              <label className="text-xs text-stone-400 mb-1 block">Title *</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData(d => ({ ...d, title: e.target.value }))}
                placeholder="Event title"
                className="bg-stone-800 border-stone-700 text-stone-200"
                data-testid="input-event-title"
              />
            </div>

            <div>
              <label className="text-xs text-stone-400 mb-1 block">Description</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData(d => ({ ...d, description: e.target.value }))}
                placeholder="What happened?"
                className="bg-stone-800 border-stone-700 text-stone-200 min-h-[80px]"
                data-testid="input-event-description"
              />
            </div>

            <div>
              <label className="text-xs text-stone-400 mb-1 block">Era</label>
              <div className="flex gap-2">
                <Input
                  value={formData.era}
                  onChange={(e) => setFormData(d => ({ ...d, era: e.target.value }))}
                  placeholder="e.g. Age of Heroes"
                  className="bg-stone-800 border-stone-700 text-stone-200 flex-1"
                  data-testid="input-event-era"
                />
              </div>
              {existingEras.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {existingEras.map(era => (
                    <Badge
                      key={era}
                      variant="outline"
                      className="text-[10px] cursor-pointer border-stone-700 text-stone-500 hover:text-stone-300 hover:border-stone-500"
                      onClick={() => setFormData(d => ({ ...d, era }))}
                    >
                      {era}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs text-stone-400 mb-1 block">Color</label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={formData.color || "#90a4ae"}
                  onChange={(e) => setFormData(d => ({ ...d, color: e.target.value }))}
                  className="w-8 h-8 p-0 border-0 bg-transparent cursor-pointer"
                  data-testid="input-event-color"
                />
                <div className="flex gap-1 flex-wrap flex-1">
                  {DEFAULT_COLORS.slice(0, 8).map(c => (
                    <button
                      key={c}
                      className={`w-5 h-5 rounded-full border-2 transition-all ${formData.color === c ? 'border-white scale-110' : 'border-transparent hover:border-stone-500'}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setFormData(d => ({ ...d, color: c }))}
                    />
                  ))}
                  {formData.color && (
                    <button
                      className="text-[9px] text-stone-500 hover:text-stone-300 px-1"
                      onClick={() => setFormData(d => ({ ...d, color: "" }))}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {selectedCalendar ? (
              <div className="space-y-2">
                <label className="text-xs text-stone-400 mb-1 block">Date ({selectedCalendar.name})</label>
                <CalendarDatePicker
                  value={formData.date}
                  calendar={selectedCalendar}
                  onChange={(v) => setFormData(d => ({ ...d, date: v }))}
                  testIdPrefix="input-event-date"
                />
                <label className="text-xs text-stone-400 mb-1 block">End Date (optional)</label>
                <CalendarDatePicker
                  value={formData.endDate}
                  calendar={selectedCalendar}
                  onChange={(v) => setFormData(d => ({ ...d, endDate: v }))}
                  testIdPrefix="input-event-end-date"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-stone-400 mb-1 block">Date</label>
                  <Input
                    value={formData.date}
                    onChange={(e) => setFormData(d => ({ ...d, date: e.target.value }))}
                    placeholder="e.g. Year 1042"
                    className="bg-stone-800 border-stone-700 text-stone-200"
                    data-testid="input-event-date"
                  />
                </div>
                <div>
                  <label className="text-xs text-stone-400 mb-1 block">End Date</label>
                  <Input
                    value={formData.endDate}
                    onChange={(e) => setFormData(d => ({ ...d, endDate: e.target.value }))}
                    placeholder="Optional"
                    className="bg-stone-800 border-stone-700 text-stone-200"
                    data-testid="input-event-end-date"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-xs text-stone-400 mb-1 block">Linked Entity</label>
              {selectedEntity ? (
                <div className="flex items-center justify-between bg-stone-800 border border-stone-700 rounded-md px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: ENTITY_TYPE_CONFIG[selectedEntity.entityType]?.color }}
                    />
                    <span className="text-xs text-stone-200">{selectedEntity.displayName}</span>
                    <Badge variant="outline" className="text-[9px] border-stone-600 text-stone-500">
                      {ENTITY_TYPE_CONFIG[selectedEntity.entityType]?.label}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-stone-500 hover:text-red-400"
                    onClick={() => setFormData(d => ({ ...d, entityId: "" }))}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div>
                  <Input
                    value={entitySearch}
                    onChange={(e) => setEntitySearch(e.target.value)}
                    placeholder="Search entities to link..."
                    className="bg-stone-800 border-stone-700 text-stone-200 mb-1"
                    data-testid="input-entity-search"
                  />
                  {entitySearch && (
                    <div className="bg-stone-800 border border-stone-700 rounded-md max-h-32 overflow-y-auto">
                      {filteredEntities.length === 0 ? (
                        <div className="text-xs text-stone-500 p-2">No entities found</div>
                      ) : (
                        filteredEntities.map(e => {
                          const cfg = ENTITY_TYPE_CONFIG[e.entityType];
                          return (
                            <button
                              key={e.id}
                              className="w-full text-left px-2 py-1.5 text-xs text-stone-300 hover:bg-stone-700 flex items-center gap-2"
                              onClick={() => {
                                setFormData(d => ({ ...d, entityId: e.id }));
                                setEntitySearch("");
                              }}
                            >
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg?.color }} />
                              <span className="truncate">{e.displayName}</span>
                              <span className="text-[9px] text-stone-500 flex-shrink-0">{cfg?.label}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {calendars.length > 0 && (
              <div>
                <label className="text-xs text-stone-400 mb-1 block">Calendar</label>
                <Select value={formData.calendarId || "none"} onValueChange={(v) => setFormData(d => ({ ...d, calendarId: v === "none" ? "" : v }))}>
                  <SelectTrigger className="bg-stone-800 border-stone-700 text-stone-200" data-testid="select-calendar">
                    <SelectValue placeholder="No calendar" />
                  </SelectTrigger>
                  <SelectContent className="bg-stone-800 border-stone-700">
                    <SelectItem value="none" className="text-stone-400">No calendar</SelectItem>
                    {calendars.map(cal => (
                      <SelectItem key={cal.id} value={cal.id} className="text-stone-200">
                        {cal.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="text-xs text-stone-400 mb-1 block">Visibility</label>
              <Select value={formData.visibility} onValueChange={(v) => setFormData(d => ({ ...d, visibility: v }))}>
                <SelectTrigger className="bg-stone-800 border-stone-700 text-stone-200" data-testid="select-visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-stone-800 border-stone-700">
                  <SelectItem value="gm_only" className="text-stone-200">
                    <div className="flex items-center gap-2">
                      <EyeOff className="h-3 w-3 text-red-400" />
                      GM Only
                    </div>
                  </SelectItem>
                  <SelectItem value="player_visible" className="text-stone-200">
                    <div className="flex items-center gap-2">
                      <Eye className="h-3 w-3 text-green-400" />
                      Player Visible
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={onClose} className="text-stone-400 hover:text-stone-200" data-testid="button-cancel-event">
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!formData.title.trim() || isSubmitting}
            className="bg-amber-600 hover:bg-amber-500 text-white"
            data-testid="button-save-event"
          >
            {isSubmitting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {isEditing ? "Save Changes" : "Create Event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
