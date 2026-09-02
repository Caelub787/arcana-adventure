import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Timeline, TimelineEvent } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Edit, Eye, EyeOff, History as HistoryIcon } from "lucide-react";

interface TimelinePanelProps {
  campaignId: string;
  isGm: boolean;
  campaignMembers?: Array<{ id: string; userId: string; username: string }>;
}

const DATE_TYPE_LABELS: Record<TimelineEvent["dateType"], string> = {
  exact: "Exact date",
  range: "Date range",
  uncertain: "Uncertain",
  relative: "Relative",
  era: "Era",
  ordered: "Ordered (no date)",
};

function formatDateValue(ev: TimelineEvent): string {
  if (ev.dateType === "ordered") return "";
  if (ev.dateType === "uncertain" || ev.dateType === "relative" || ev.dateType === "era") {
    return typeof ev.dateValue === "string" ? ev.dateValue : (ev.dateValue?.text || "");
  }
  const v = ev.dateValue || {};
  const parts = [v.year, v.month, v.day].filter((x: any) => x !== undefined && x !== null && x !== "");
  let label = parts.length ? `Y${v.year ?? "?"}${v.month ? `-${v.month}` : ""}${v.day ? `-${v.day}` : ""}` : "";
  if (ev.dateType === "range" && ev.endDateValue) {
    const e = ev.endDateValue || {};
    label += ` → Y${e.year ?? "?"}${e.month ? `-${e.month}` : ""}${e.day ? `-${e.day}` : ""}`;
  }
  return label;
}

export function TimelinePanel({ campaignId, isGm, campaignMembers = [] }: TimelinePanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTimelineId, setSelectedTimelineId] = useState<string | null>(null);
  const [newTimelineOpen, setNewTimelineOpen] = useState(false);
  const [newTimelineName, setNewTimelineName] = useState("");
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TimelineEvent | null>(null);
  const [deleteEventTarget, setDeleteEventTarget] = useState<TimelineEvent | null>(null);

  const { data: timelines = [], isLoading: timelinesLoading } = useQuery<Timeline[]>({
    queryKey: ["/api/timelines", campaignId],
    queryFn: () => api.getTimelines(campaignId),
    enabled: !!campaignId,
  });

  const activeTimeline = timelines.find(t => t.id === selectedTimelineId) || timelines[0] || null;

  const { data: events = [], isLoading: eventsLoading } = useQuery<TimelineEvent[]>({
    queryKey: ["/api/timelines", activeTimeline?.id, "events"],
    queryFn: () => api.getTimelineEvents(activeTimeline!.id),
    enabled: !!activeTimeline?.id,
  });

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  }, [events]);

  const createTimelineMutation = useMutation({
    mutationFn: (name: string) => api.createTimeline({ campaignId, name }),
    onSuccess: (timeline) => {
      queryClient.invalidateQueries({ queryKey: ["/api/timelines", campaignId] });
      setSelectedTimelineId(timeline.id);
      setNewTimelineOpen(false);
      setNewTimelineName("");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteTimelineMutation = useMutation({
    mutationFn: (id: string) => api.deleteTimeline(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timelines", campaignId] });
      setSelectedTimelineId(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const saveEventMutation = useMutation({
    mutationFn: (data: Partial<TimelineEvent>) => {
      if (editingEvent) return api.updateTimelineEvent(editingEvent.id, data);
      return api.createTimelineEvent({ ...data, timelineId: activeTimeline!.id } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timelines", activeTimeline?.id, "events"] });
      setEventDialogOpen(false);
      setEditingEvent(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteEventMutation = useMutation({
    mutationFn: (id: string) => api.deleteTimelineEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timelines", activeTimeline?.id, "events"] });
      setDeleteEventTarget(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="flex h-full min-h-0 overflow-hidden" data-testid="panel-timelines">
      <div className="w-48 shrink-0 border-r border-stone-800 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-2 py-2 border-b border-stone-800">
          <span className="text-xs font-semibold text-stone-400 flex items-center gap-1">
            <HistoryIcon className="h-3 w-3" /> Timelines
          </span>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setNewTimelineOpen(true)} data-testid="button-new-timeline">
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-1 space-y-0.5">
            {timelines.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTimelineId(t.id)}
                className={`w-full text-left px-2 py-1.5 rounded text-xs truncate ${activeTimeline?.id === t.id ? "bg-amber-900/30 text-amber-300" : "text-stone-300 hover:bg-stone-800"}`}
                data-testid={`button-select-timeline-${t.id}`}
              >
                {t.name}
              </button>
            ))}
            {!timelinesLoading && timelines.length === 0 && (
              <div className="text-[11px] text-stone-600 px-2 py-3">No timelines yet.</div>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {!activeTimeline ? (
          <div className="flex-1 flex items-center justify-center text-sm text-stone-500">
            Create a timeline to get started.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-3 py-2 border-b border-stone-800 shrink-0">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-stone-200 truncate">{activeTimeline.name}</div>
                {activeTimeline.description && <div className="text-[11px] text-stone-500 truncate">{activeTimeline.description}</div>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" className="h-6 text-xs" onClick={() => { setEditingEvent(null); setEventDialogOpen(true); }} data-testid="button-new-timeline-event">
                  <Plus className="h-3 w-3 mr-1" /> Event
                </Button>
                {(isGm || activeTimeline.userId) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-stone-500 hover:text-red-400"
                    onClick={() => deleteTimelineMutation.mutate(activeTimeline.id)}
                    data-testid="button-delete-timeline"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="relative pl-5 pr-3 py-3">
                <div className="absolute left-[9px] top-0 bottom-0 w-px bg-stone-800" />
                {sortedEvents.map((ev) => (
                  <div key={ev.id} className="relative mb-3 pl-4" data-testid={`timeline-event-${ev.id}`}>
                    <div
                      className="absolute -left-[11px] top-1 h-2.5 w-2.5 rounded-full border-2 border-stone-950"
                      style={{ backgroundColor: ev.color || "#d97706" }}
                    />
                    <div className="rounded-lg border border-stone-800 bg-stone-900/60 p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-semibold text-stone-200">{ev.title}</span>
                            {ev.category && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-stone-700 text-stone-400">{ev.category}</Badge>}
                            {ev.visibility !== "party" && (
                              <span className="text-[9px] text-stone-500 flex items-center gap-0.5">
                                <EyeOff className="h-2.5 w-2.5" />
                                {ev.visibility === "gm" ? "GM only" : "Specific players"}
                              </span>
                            )}
                          </div>
                          {formatDateValue(ev) && <div className="text-[10px] text-stone-500 mt-0.5">{formatDateValue(ev)}</div>}
                          {ev.description && <div className="text-[11px] text-stone-400 mt-1 whitespace-pre-wrap">{ev.description}</div>}
                          {ev.tags && ev.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {ev.tags.map((tag, i) => (
                                <span key={i} className="text-[9px] px-1 rounded bg-stone-800 text-stone-400">{tag}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        {(isGm || ev.userId) && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <Button variant="ghost" size="icon" className="h-5 w-5 text-stone-500 hover:text-stone-200" onClick={() => { setEditingEvent(ev); setEventDialogOpen(true); }} data-testid={`button-edit-event-${ev.id}`}>
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-5 w-5 text-stone-500 hover:text-red-400" onClick={() => setDeleteEventTarget(ev)} data-testid={`button-delete-event-${ev.id}`}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {!eventsLoading && sortedEvents.length === 0 && (
                  <div className="text-xs text-stone-600 py-6 text-center">No events yet on this timeline.</div>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </div>

      <Dialog open={newTimelineOpen} onOpenChange={setNewTimelineOpen}>
        <DialogContent className="bg-stone-950 border-stone-800 text-stone-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">New Timeline</DialogTitle>
          </DialogHeader>
          <Input
            value={newTimelineName}
            onChange={(e) => setNewTimelineName(e.target.value)}
            placeholder="Timeline name"
            className="bg-stone-900 border-stone-700"
            data-testid="input-new-timeline-name"
          />
          <DialogFooter>
            <Button
              size="sm"
              disabled={!newTimelineName.trim() || createTimelineMutation.isPending}
              onClick={() => createTimelineMutation.mutate(newTimelineName.trim())}
              data-testid="button-confirm-new-timeline"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {eventDialogOpen && (
        <TimelineEventDialog
          event={editingEvent}
          isGm={isGm}
          campaignMembers={campaignMembers}
          onClose={() => { setEventDialogOpen(false); setEditingEvent(null); }}
          onSave={(data) => saveEventMutation.mutate(data)}
          saving={saveEventMutation.isPending}
        />
      )}

      <Dialog open={!!deleteEventTarget} onOpenChange={(open) => !open && setDeleteEventTarget(null)}>
        <DialogContent className="bg-stone-950 border-stone-800 text-stone-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Delete Event</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-stone-400">Delete "{deleteEventTarget?.title}"? This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteEventTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteEventTarget && deleteEventMutation.mutate(deleteEventTarget.id)}
              data-testid="button-confirm-delete-event"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TimelineEventDialog({
  event,
  isGm,
  campaignMembers,
  onClose,
  onSave,
  saving,
}: {
  event: TimelineEvent | null;
  isGm: boolean;
  campaignMembers: Array<{ id: string; userId: string; username: string }>;
  onClose: () => void;
  onSave: (data: Partial<TimelineEvent>) => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(event?.title || "");
  const [description, setDescription] = useState(event?.description || "");
  const [dateType, setDateType] = useState<TimelineEvent["dateType"]>(event?.dateType || "ordered");
  const [dateText, setDateText] = useState(
    event && (event.dateType === "uncertain" || event.dateType === "relative" || event.dateType === "era")
      ? (typeof event.dateValue === "string" ? event.dateValue : event.dateValue?.text || "")
      : ""
  );
  const [year, setYear] = useState(event?.dateValue?.year?.toString() || "");
  const [category, setCategory] = useState(event?.category || "");
  const [color, setColor] = useState(event?.color || "#d97706");
  const [visibility, setVisibility] = useState(event?.visibility || "gm");
  const [visiblePlayerIds, setVisiblePlayerIds] = useState<string[]>(event?.visiblePlayerIds || []);

  const handleSave = () => {
    if (!title.trim()) return;
    const dateValue =
      dateType === "exact" || dateType === "range"
        ? (year ? { year: Number(year) } : {})
        : dateType === "uncertain" || dateType === "relative" || dateType === "era"
        ? dateText
        : undefined;
    onSave({
      title: title.trim(),
      description,
      dateType,
      dateValue,
      category: category || null,
      color,
      visibility,
      visiblePlayerIds: visibility === "players" ? visiblePlayerIds : null,
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-stone-950 border-stone-800 text-stone-100 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">{event ? "Edit Event" : "New Event"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" className="bg-stone-900 border-stone-700" data-testid="input-event-title" />
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="bg-stone-900 border-stone-700 min-h-[70px]" data-testid="input-event-description" />
          <div className="flex gap-2">
            <Select value={dateType} onValueChange={(v) => setDateType(v as TimelineEvent["dateType"])}>
              <SelectTrigger className="h-8 text-xs bg-stone-900 border-stone-700 flex-1" data-testid="select-event-date-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-stone-900 border-stone-700 text-xs">
                {Object.entries(DATE_TYPE_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" className="h-8 text-xs bg-stone-900 border-stone-700 flex-1" data-testid="input-event-category" />
          </div>
          {(dateType === "exact" || dateType === "range") && (
            <Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year" type="number" className="h-8 text-xs bg-stone-900 border-stone-700" data-testid="input-event-year" />
          )}
          {(dateType === "uncertain" || dateType === "relative" || dateType === "era") && (
            <Input value={dateText} onChange={(e) => setDateText(e.target.value)} placeholder="e.g. 'Third Age', 'a decade before the war'" className="h-8 text-xs bg-stone-900 border-stone-700" data-testid="input-event-date-text" />
          )}
          <div className="flex items-center gap-2">
            <Label className="text-[10px] text-stone-500">Color</Label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-6 w-8 rounded border border-stone-700 bg-stone-900" data-testid="input-event-color" />
          </div>
          {isGm && (
            <div className="border-t border-stone-800 pt-2 space-y-1.5">
              <Label className="text-[10px] text-stone-500 flex items-center gap-1"><Eye className="h-2.5 w-2.5" /> Visibility</Label>
              <Select value={visibility} onValueChange={setVisibility}>
                <SelectTrigger className="h-8 text-xs bg-stone-900 border-stone-700" data-testid="select-event-visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-stone-900 border-stone-700 text-xs">
                  <SelectItem value="gm">GM Only</SelectItem>
                  <SelectItem value="party">Party</SelectItem>
                  <SelectItem value="players">Specific Players</SelectItem>
                </SelectContent>
              </Select>
              {visibility === "players" && (
                <div className="flex flex-wrap gap-1">
                  {campaignMembers.map((m) => {
                    const active = visiblePlayerIds.includes(m.userId);
                    return (
                      <button
                        key={m.userId}
                        type="button"
                        onClick={() => setVisiblePlayerIds(active ? visiblePlayerIds.filter(id => id !== m.userId) : [...visiblePlayerIds, m.userId])}
                        className={`px-1.5 py-0.5 rounded text-[10px] border ${active ? "bg-amber-900/30 border-amber-600/60 text-amber-300" : "bg-stone-800 border-stone-700 text-stone-400"}`}
                        data-testid={`button-event-visible-to-${m.userId}`}
                      >
                        {m.username}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!title.trim() || saving} onClick={handleSave} data-testid="button-save-event">
            {event ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
