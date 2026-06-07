import React, { useState, useMemo, useCallback } from "react";
import { LoadingLogo } from "@/components/LoadingLogo";
import { useCalendars, useCreateCalendar, useUpdateCalendar, useDeleteCalendar, useTimelineEvents, useCalendarSyncs, useCreateCalendarSync, useDeleteCalendarSync, type WorldCalendar as WorldCalendarType, type WorldTimelineEvent, type WorldCalendarSync } from "@/lib/worldbuilding-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Calendar, Plus, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Settings, Trash2, Edit2, X, ChevronDown, ChevronUp, Save, Star, Link2, Unlink, PartyPopper } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface WorldCalendarProps {
  campaignId?: string;
  worldId?: string;
  isGM?: boolean;
}

const DEFAULT_MONTH_NAMES = ["Deepwinter", "Clawstorm", "Thawmelt", "Greenrise", "Bloomtide", "Sunsreach", "Highflame", "Goldleaf", "Harvestwane", "Duskfall", "Frostmoon", "Longnight"];
const DEFAULT_DAYS_PER_MONTH = [30, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const DEFAULT_WEEKDAY_NAMES = ["Moonday", "Twinday", "Ashday", "Wineday", "Thunderday", "Starday", "Sunday"];

function totalDaysFromEpoch(year: number, month: number, day: number, daysPerMonth: number[]): number {
  const totalMonths = daysPerMonth.length;
  let total = 0;
  const fullYears = year - 1;
  const daysPerYear = daysPerMonth.reduce((s, d) => s + d, 0);
  total += fullYears * daysPerYear;
  for (let m = 0; m < month; m++) {
    total += daysPerMonth[m] || 30;
  }
  total += day;
  return total;
}

function dateFromTotalDays(totalDays: number, daysPerMonth: number[]): { year: number; month: number; day: number } {
  const daysPerYear = daysPerMonth.reduce((s, d) => s + d, 0);
  if (daysPerYear <= 0) return { year: 1, month: 0, day: 1 };
  let remaining = totalDays;
  let year = 1;
  if (remaining > daysPerYear) {
    const fullYears = Math.floor((remaining - 1) / daysPerYear);
    year += fullYears;
    remaining -= fullYears * daysPerYear;
  }
  let month = 0;
  while (month < daysPerMonth.length && remaining > (daysPerMonth[month] || 30)) {
    remaining -= (daysPerMonth[month] || 30);
    month++;
  }
  if (month >= daysPerMonth.length) { month = daysPerMonth.length - 1; }
  return { year, month, day: Math.max(1, remaining) };
}

function convertEventDate(dateStr: string, sourceCalendar: WorldCalendarType, targetCalendar: WorldCalendarType, epochOffset: number): { month: number; day: number; year?: number } | null {
  const parts = dateStr.split("-");
  if (parts.length < 2) return null;
  const srcMonth = parseInt(parts[0], 10) - 1;
  const srcDay = parseInt(parts[1], 10);
  const srcYear = parts.length >= 3 ? parseInt(parts[2], 10) : 1;
  const srcDPM = (sourceCalendar.daysPerMonth as number[]) || [];
  const tgtDPM = (targetCalendar.daysPerMonth as number[]) || [];
  const srcTotal = totalDaysFromEpoch(srcYear, srcMonth, srcDay, srcDPM);
  const tgtTotal = srcTotal + epochOffset;
  if (tgtTotal < 1) return null;
  const result = dateFromTotalDays(tgtTotal, tgtDPM);
  return { month: result.month, day: result.day, year: parts.length >= 3 ? result.year : undefined };
}

export function WorldCalendar({ campaignId, worldId, isGM = false }: WorldCalendarProps) {
  const { toast } = useToast();
  const resolvedId = worldId || campaignId;
  const { data: calendars = [], isLoading } = useCalendars(resolvedId);
  const { data: timelineEvents = [] } = useTimelineEvents(resolvedId);
  const { data: calendarSyncs = [] } = useCalendarSyncs(resolvedId);
  const createCalendar = useCreateCalendar(resolvedId);
  const updateCalendar = useUpdateCalendar(resolvedId);
  const deleteCalendar = useDeleteCalendar(resolvedId);
  const createSync = useCreateCalendarSync(resolvedId);
  const deleteSync = useDeleteCalendarSync(resolvedId);

  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showDayNoteDialog, setShowDayNoteDialog] = useState(false);
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [syncTargetCalendarId, setSyncTargetCalendarId] = useState("");
  const [syncAlignSourceDate, setSyncAlignSourceDate] = useState({ month: 0, day: 1, year: 1 });
  const [syncAlignTargetDate, setSyncAlignTargetDate] = useState({ month: 0, day: 1, year: 1 });
  const [selectedDay, setSelectedDay] = useState<{ month: number; day: number } | null>(null);
  const [dayNoteText, setDayNoteText] = useState("");
  const [viewMonth, setViewMonth] = useState<number | null>(null);
  const [viewYear, setViewYear] = useState<number | null>(null);

  const [formName, setFormName] = useState("");
  const [formYearSuffix, setFormYearSuffix] = useState("");
  const [formMonthNames, setFormMonthNames] = useState<string[]>(DEFAULT_MONTH_NAMES);
  const [formDaysPerMonth, setFormDaysPerMonth] = useState<number[]>(DEFAULT_DAYS_PER_MONTH);
  const [formWeekDayNames, setFormWeekDayNames] = useState<string[]>(DEFAULT_WEEKDAY_NAMES);

  const [showEventDialog, setShowEventDialog] = useState(false);
  const [showEventsPanel, setShowEventsPanel] = useState(false);
  const [editingEventIdx, setEditingEventIdx] = useState<number | null>(null);
  const [eventFormName, setEventFormName] = useState("");
  const [eventFormMonth, setEventFormMonth] = useState(0);
  const [eventFormDay, setEventFormDay] = useState(1);
  const [eventFormColor, setEventFormColor] = useState("#ffb74d");
  const [eventFormDescription, setEventFormDescription] = useState("");
  const [eventFormRecurring, setEventFormRecurring] = useState(true);

  const [showJumpDialog, setShowJumpDialog] = useState(false);
  const [jumpMonth, setJumpMonth] = useState(0);
  const [jumpYear, setJumpYear] = useState(1);

  const selectedCalendar = calendars.find(c => c.id === selectedCalendarId) || calendars[0];

  const currentMonth = viewMonth ?? (selectedCalendar?.currentMonth ?? 0);
  const currentYear = viewYear ?? (selectedCalendar?.currentYear ?? 1);

  const syncedEventsForCalendar = useMemo(() => {
    if (!selectedCalendar) return [];
    const syncsForThis = calendarSyncs.filter(
      s => s.sourceCalendarId === selectedCalendar.id || s.targetCalendarId === selectedCalendar.id
    );
    if (syncsForThis.length === 0) return [];

    const results: Array<WorldTimelineEvent & { _syncedMonth: number; _syncedDay: number; _syncedYear?: number; _fromCalendarName: string }> = [];

    for (const sync of syncsForThis) {
      const isSource = sync.sourceCalendarId === selectedCalendar.id;
      const otherCalId = isSource ? sync.targetCalendarId : sync.sourceCalendarId;
      const otherCal = calendars.find(c => c.id === otherCalId);
      if (!otherCal) continue;

      const offset = isSource ? -sync.epochOffset : sync.epochOffset;
      const otherEvents = timelineEvents.filter(e => e.calendarId === otherCalId && e.date);

      for (const ev of otherEvents) {
        const converted = convertEventDate(ev.date!, otherCal, selectedCalendar, offset);
        if (converted) {
          results.push({
            ...ev,
            _syncedMonth: converted.month,
            _syncedDay: converted.day,
            _syncedYear: converted.year,
            _fromCalendarName: otherCal.name,
          });
        }
      }
    }
    return results;
  }, [selectedCalendar, calendarSyncs, calendars, timelineEvents]);

  const calendarEvents = useMemo(() => {
    if (!selectedCalendar) return [];
    return timelineEvents.filter(e => e.calendarId === selectedCalendar.id);
  }, [timelineEvents, selectedCalendar]);

  const eventsForDay = useCallback((month: number, day: number) => {
    const month1Based = month + 1;
    const native = calendarEvents.filter(e => {
      if (!e.date) return false;
      const parts = e.date.split("-");
      if (parts.length >= 2) {
        const eMonth = parseInt(parts[0], 10);
        const eDay = parseInt(parts[1], 10);
        return eMonth === month1Based && eDay === day;
      }
      return false;
    });
    const synced = syncedEventsForCalendar.filter(e => e._syncedMonth === month && e._syncedDay === day);
    return [...native, ...synced];
  }, [calendarEvents, syncedEventsForCalendar]);

  const getDayNote = useCallback((month: number, day: number): string => {
    if (!selectedCalendar?.notes) return "";
    const key = `${month}-${day}`;
    return (selectedCalendar.notes as Record<string, string>)[key] || "";
  }, [selectedCalendar]);

  type CalendarEvent = { name: string; month: number; day: number; color?: string; description?: string; recurring?: boolean };
  const calendarHolidays = useMemo<CalendarEvent[]>(() => {
    return ((selectedCalendar as any)?.events as CalendarEvent[]) || [];
  }, [selectedCalendar]);

  const holidaysForDay = useCallback((month: number, day: number) => {
    return calendarHolidays.filter(h => h.month === month && h.day === day);
  }, [calendarHolidays]);

  const openCreateEvent = (prefillMonth?: number, prefillDay?: number) => {
    setEditingEventIdx(null);
    setEventFormName("");
    setEventFormMonth(prefillMonth ?? currentMonth);
    setEventFormDay(prefillDay ?? 1);
    setEventFormColor("#ffb74d");
    setEventFormDescription("");
    setEventFormRecurring(true);
    setShowEventDialog(true);
  };

  const openEditEvent = (idx: number) => {
    const ev = calendarHolidays[idx];
    setEditingEventIdx(idx);
    setEventFormName(ev.name);
    setEventFormMonth(ev.month);
    setEventFormDay(ev.day);
    setEventFormColor(ev.color || "#ffb74d");
    setEventFormDescription(ev.description || "");
    setEventFormRecurring(ev.recurring !== false);
    setShowEventDialog(true);
  };

  const handleSaveEvent = async () => {
    if (!eventFormName.trim() || !selectedCalendar) return;
    const newEvent: CalendarEvent = {
      name: eventFormName.trim(),
      month: eventFormMonth,
      day: eventFormDay,
      color: eventFormColor || undefined,
      description: eventFormDescription.trim() || undefined,
      recurring: eventFormRecurring,
    };
    let updated: CalendarEvent[];
    if (editingEventIdx !== null) {
      updated = calendarHolidays.map((e, i) => i === editingEventIdx ? newEvent : e);
    } else {
      updated = [...calendarHolidays, newEvent];
    }
    try {
      await updateCalendar.mutateAsync({ id: selectedCalendar.id, events: updated });
      setShowEventDialog(false);
      toast({ title: editingEventIdx !== null ? "Event updated" : "Event created" });
    } catch (e: any) {
      toast({ title: "Failed to save event", description: e.message, variant: "destructive" });
    }
  };

  const handleDeleteCalEvent = async (idx: number) => {
    if (!selectedCalendar) return;
    const updated = calendarHolidays.filter((_, i) => i !== idx);
    try {
      await updateCalendar.mutateAsync({ id: selectedCalendar.id, events: updated });
      toast({ title: "Event deleted" });
    } catch (e: any) {
      toast({ title: "Failed to delete event", description: e.message, variant: "destructive" });
    }
  };

  const calendarGrid = useMemo(() => {
    if (!selectedCalendar) return [];
    const monthNames = selectedCalendar.monthNames as string[];
    const daysPerMonth = selectedCalendar.daysPerMonth as number[];
    const weekDayNames = selectedCalendar.weekDayNames as string[];
    if (!monthNames?.length || !daysPerMonth?.length || !weekDayNames?.length) return [];

    const daysInMonth = daysPerMonth[currentMonth] || 30;
    const weekLength = weekDayNames.length;

    let totalDaysBefore = 0;
    for (let y = 1; y < currentYear; y++) {
      for (let m = 0; m < daysPerMonth.length; m++) {
        totalDaysBefore += daysPerMonth[m] || 30;
      }
    }
    for (let m = 0; m < currentMonth; m++) {
      totalDaysBefore += daysPerMonth[m] || 30;
    }
    const startDayOfWeek = totalDaysBefore % weekLength;

    const weeks: (number | null)[][] = [];
    let currentWeek: (number | null)[] = [];

    for (let i = 0; i < startDayOfWeek; i++) {
      currentWeek.push(null);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      currentWeek.push(d);
      if (currentWeek.length === weekLength) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    if (currentWeek.length > 0) {
      while (currentWeek.length < weekLength) {
        currentWeek.push(null);
      }
      weeks.push(currentWeek);
    }

    return weeks;
  }, [selectedCalendar, currentMonth, currentYear]);

  const handleCreateCalendar = async () => {
    if (!formName.trim()) return;
    try {
      await createCalendar.mutateAsync({
        ...(worldId ? { worldId } : { campaignId }),
        name: formName.trim(),
        monthNames: formMonthNames,
        daysPerMonth: formDaysPerMonth,
        weekDayNames: formWeekDayNames,
        yearSuffix: formYearSuffix || null,
        currentYear: 1,
        currentMonth: 0,
        currentDay: 1,
        notes: {},
      });
      setShowCreateDialog(false);
      setFormName("");
      toast({ title: "Calendar created" });
    } catch (e: any) {
      toast({ title: "Failed to create calendar", description: e.message, variant: "destructive" });
    }
  };

  const handleUpdateSettings = async () => {
    if (!selectedCalendar) return;
    try {
      await updateCalendar.mutateAsync({
        id: selectedCalendar.id,
        name: formName.trim() || selectedCalendar.name,
        monthNames: formMonthNames,
        daysPerMonth: formDaysPerMonth,
        weekDayNames: formWeekDayNames,
        yearSuffix: formYearSuffix || null,
      });
      setShowSettingsDialog(false);
      toast({ title: "Calendar updated" });
    } catch (e: any) {
      toast({ title: "Failed to update calendar", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!selectedCalendar) return;
    if (!confirm("Delete this calendar? This cannot be undone.")) return;
    try {
      await deleteCalendar.mutateAsync(selectedCalendar.id);
      setSelectedCalendarId(null);
      toast({ title: "Calendar deleted" });
    } catch (e: any) {
      toast({ title: "Failed to delete calendar", description: e.message, variant: "destructive" });
    }
  };

  const openSettings = () => {
    if (!selectedCalendar) return;
    setFormName(selectedCalendar.name);
    setFormYearSuffix(selectedCalendar.yearSuffix || "");
    setFormMonthNames([...(selectedCalendar.monthNames as string[])]);
    setFormDaysPerMonth([...(selectedCalendar.daysPerMonth as number[])]);
    setFormWeekDayNames([...(selectedCalendar.weekDayNames as string[])]);
    setShowSettingsDialog(true);
  };

  const openCreate = () => {
    setFormName("");
    setFormYearSuffix("");
    setFormMonthNames([...DEFAULT_MONTH_NAMES]);
    setFormDaysPerMonth([...DEFAULT_DAYS_PER_MONTH]);
    setFormWeekDayNames([...DEFAULT_WEEKDAY_NAMES]);
    setShowCreateDialog(true);
  };

  const openSyncDialog = () => {
    setSyncTargetCalendarId("");
    setSyncAlignSourceDate({ month: 0, day: 1, year: 1 });
    setSyncAlignTargetDate({ month: 0, day: 1, year: 1 });
    setShowSyncDialog(true);
  };

  const handleCreateSync = async () => {
    if (!selectedCalendar || !syncTargetCalendarId) return;
    const targetCal = calendars.find(c => c.id === syncTargetCalendarId);
    if (!targetCal) return;

    const srcDPM = (selectedCalendar.daysPerMonth as number[]) || [];
    const tgtDPM = (targetCal.daysPerMonth as number[]) || [];
    const srcTotal = totalDaysFromEpoch(syncAlignSourceDate.year, syncAlignSourceDate.month, syncAlignSourceDate.day, srcDPM);
    const tgtTotal = totalDaysFromEpoch(syncAlignTargetDate.year, syncAlignTargetDate.month, syncAlignTargetDate.day, tgtDPM);
    const epochOffset = tgtTotal - srcTotal;

    try {
      await createSync.mutateAsync({
        sourceCalendarId: selectedCalendar.id,
        targetCalendarId: syncTargetCalendarId,
        epochOffset,
      });
      setShowSyncDialog(false);
      toast({ title: "Calendars synced" });
    } catch (e: any) {
      toast({ title: "Failed to sync calendars", description: e.message, variant: "destructive" });
    }
  };

  const handleDeleteSync = async (syncId: string) => {
    try {
      await deleteSync.mutateAsync(syncId);
      toast({ title: "Sync removed" });
    } catch (e: any) {
      toast({ title: "Failed to remove sync", description: e.message, variant: "destructive" });
    }
  };

  const syncsForCurrentCalendar = useMemo(() => {
    if (!selectedCalendar) return [];
    return calendarSyncs.filter(s => s.sourceCalendarId === selectedCalendar.id || s.targetCalendarId === selectedCalendar.id);
  }, [calendarSyncs, selectedCalendar]);

  const navigateMonth = (delta: number) => {
    if (!selectedCalendar) return;
    const months = (selectedCalendar.monthNames as string[]).length;
    let newMonth = currentMonth + delta;
    let newYear = currentYear;
    if (newMonth < 0) {
      newMonth = months - 1;
      newYear--;
    } else if (newMonth >= months) {
      newMonth = 0;
      newYear++;
    }
    setViewMonth(newMonth);
    setViewYear(newYear);
  };

  const goToCurrentDate = () => {
    if (!selectedCalendar) return;
    setViewMonth(selectedCalendar.currentMonth ?? 0);
    setViewYear(selectedCalendar.currentYear ?? 1);
  };

  const advanceDay = async (delta: number) => {
    if (!selectedCalendar) return;
    const months = (selectedCalendar.monthNames as string[]).length;
    const daysPerMonth = selectedCalendar.daysPerMonth as number[];
    let day = (selectedCalendar.currentDay ?? 1) + delta;
    let month = selectedCalendar.currentMonth ?? 0;
    let year = selectedCalendar.currentYear ?? 1;

    while (day > (daysPerMonth[month] || 30)) {
      day -= (daysPerMonth[month] || 30);
      month++;
      if (month >= months) { month = 0; year++; }
    }
    while (day < 1) {
      month--;
      if (month < 0) { month = months - 1; year--; }
      day += (daysPerMonth[month] || 30);
    }

    try {
      await updateCalendar.mutateAsync({
        id: selectedCalendar.id,
        currentDay: day,
        currentMonth: month,
        currentYear: year,
      });
    } catch (e: any) {
      toast({ title: "Failed to advance date", description: e.message, variant: "destructive" });
    }
  };

  const handleDayClick = (day: number) => {
    const note = getDayNote(currentMonth, day);
    setSelectedDay({ month: currentMonth, day });
    setDayNoteText(note);
    setShowDayNoteDialog(true);
  };

  const saveDayNote = async () => {
    if (!selectedCalendar || !selectedDay) return;
    const key = `${selectedDay.month}-${selectedDay.day}`;
    const existingNotes = (selectedCalendar.notes as Record<string, string>) || {};
    const updatedNotes = { ...existingNotes };
    if (dayNoteText.trim()) {
      updatedNotes[key] = dayNoteText.trim();
    } else {
      delete updatedNotes[key];
    }
    try {
      await updateCalendar.mutateAsync({ id: selectedCalendar.id, notes: updatedNotes });
      setShowDayNoteDialog(false);
      toast({ title: "Day note saved" });
    } catch (e: any) {
      toast({ title: "Failed to save note", description: e.message, variant: "destructive" });
    }
  };

  const isCurrentDay = (day: number) => {
    if (!selectedCalendar) return false;
    return currentMonth === (selectedCalendar.currentMonth ?? 0) &&
      currentYear === (selectedCalendar.currentYear ?? 1) &&
      day === (selectedCalendar.currentDay ?? 1);
  };

  const renderDialogs = () => (
    <>
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 w-full max-w-[95vw] md:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-stone-100">Create Calendar</DialogTitle>
          </DialogHeader>
          <CalendarForm
            name={formName}
            setName={setFormName}
            yearSuffix={formYearSuffix}
            setYearSuffix={setFormYearSuffix}
            monthNames={formMonthNames}
            setMonthNames={setFormMonthNames}
            daysPerMonth={formDaysPerMonth}
            setDaysPerMonth={setFormDaysPerMonth}
            weekDayNames={formWeekDayNames}
            setWeekDayNames={setFormWeekDayNames}
          />
          <DialogFooter>
            <Button variant="ghost" className="text-stone-400" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-500 text-white" onClick={handleCreateCalendar} disabled={createCalendar.isPending} data-testid="button-confirm-create-calendar">
              {createCalendar.isPending ? <LoadingLogo className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingLogo className="h-8 w-8 text-stone-500" />
      </div>
    );
  }

  if (calendars.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <Calendar className="h-16 w-16 text-stone-700 mb-4" />
          <h2 className="text-xl font-semibold text-stone-500 mb-2" data-testid="text-no-calendars">No Calendars Yet</h2>
          <p className="text-stone-600 text-sm max-w-md mb-6">Create a custom calendar system with unique months, weekdays, and events for your world.</p>
          {isGM && (
            <Button className="bg-amber-600 hover:bg-amber-500 text-white" onClick={openCreate} data-testid="button-create-first-calendar">
              <Plus className="h-4 w-4 mr-2" />
              Create Calendar
            </Button>
          )}
        </div>
        {renderDialogs()}
      </>
    );
  }

  const monthNames = (selectedCalendar?.monthNames as string[]) || [];
  const weekDayNames = (selectedCalendar?.weekDayNames as string[]) || [];
  const currentMonthName = monthNames[currentMonth] || `Month ${currentMonth + 1}`;
  const yearSuffix = selectedCalendar?.yearSuffix || "";

  return (
    <div className="flex flex-col h-full" data-testid="world-calendar">
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800 bg-stone-900/30">
        <div className="flex items-center gap-2 flex-wrap">
          {calendars.length > 1 && (
            <select
              className="bg-stone-800 border border-stone-700 text-stone-200 rounded px-2 py-1 text-xs"
              value={selectedCalendar?.id || ""}
              onChange={(e) => { setSelectedCalendarId(e.target.value); setViewMonth(null); setViewYear(null); }}
              data-testid="select-calendar"
            >
              {calendars.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          {calendars.length === 1 && (
            <h2 className="text-sm font-semibold text-stone-200">{selectedCalendar?.name}</h2>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isGM && (
            <>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-400 hover:text-amber-400" onClick={openCreate} title="New Calendar" data-testid="button-create-calendar">
                <Plus className="h-3.5 w-3.5" />
              </Button>
              {calendars.length > 1 && (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-400 hover:text-blue-400" onClick={openSyncDialog} title="Sync Calendars" data-testid="button-sync-calendars">
                  <Link2 className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button variant="ghost" size="sm" className="h-7 text-xs text-stone-400 hover:text-amber-400" onClick={() => setShowEventsPanel(!showEventsPanel)} title="Events & Holidays" data-testid="button-toggle-events">
                <PartyPopper className="h-3.5 w-3.5 mr-1" />
                Events {calendarHolidays.length > 0 && `(${calendarHolidays.length})`}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-400 hover:text-amber-400" onClick={openSettings} title="Calendar Settings" data-testid="button-calendar-settings">
                <Settings className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-400 hover:text-red-400" onClick={handleDelete} title="Delete Calendar" data-testid="button-delete-calendar">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {showEventsPanel && isGM && (
        <div className="border-b border-stone-800 px-4 py-3 bg-stone-900/50" data-testid="events-panel">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium text-stone-400 uppercase tracking-wider">Events & Holidays</h4>
            <Button onClick={() => openCreateEvent()} variant="ghost" size="sm" className="h-6 text-xs text-amber-400 hover:text-amber-300" data-testid="button-add-calendar-event">
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </div>
          {calendarHolidays.length === 0 ? (
            <p className="text-xs text-stone-500 py-1">No events or holidays defined yet.</p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {calendarHolidays.map((h, idx) => {
                const monthName = (selectedCalendar?.monthNames as string[])?.[h.month] || `Month ${h.month + 1}`;
                return (
                  <div key={idx} className="flex items-center gap-2 px-2 py-1.5 rounded bg-stone-800/60 border border-stone-700/50 group" data-testid={`calendar-event-item-${idx}`}>
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: h.color || "#ffb74d" }} />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-stone-200">{h.name}</span>
                      <span className="text-[10px] text-stone-500 ml-1.5">{monthName}, Day {h.day}</span>
                      {h.recurring !== false && <Badge variant="outline" className="text-[8px] border-amber-500/20 text-amber-500 px-1 ml-1">Yearly</Badge>}
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-5 w-5 text-stone-500 hover:text-stone-200" onClick={() => openEditEvent(idx)} data-testid={`button-edit-cal-event-${idx}`}>
                        <Edit2 className="h-2.5 w-2.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-5 w-5 text-stone-500 hover:text-red-400" onClick={() => handleDeleteCalEvent(idx)} data-testid={`button-delete-cal-event-${idx}`}>
                        <Trash2 className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-2 border-b border-stone-800">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-stone-400 hover:text-stone-200" onClick={() => navigateMonth(-1)} data-testid="button-prev-month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <button
          className="text-center cursor-pointer hover:bg-stone-800/50 rounded-lg px-3 py-1 transition-colors group"
          onClick={() => { setJumpMonth(currentMonth); setJumpYear(currentYear); setShowJumpDialog(true); }}
          title="Jump to a specific month/year"
          data-testid="button-jump-date"
        >
          <h3 className="text-base font-semibold text-stone-200 group-hover:text-amber-300 transition-colors" data-testid="text-current-month">{currentMonthName}</h3>
          <p className="text-xs text-stone-500 group-hover:text-stone-400 transition-colors" data-testid="text-current-year">Year {currentYear}{yearSuffix ? ` ${yearSuffix}` : ""}</p>
        </button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-stone-400 hover:text-stone-200" onClick={() => navigateMonth(1)} data-testid="button-next-month">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {isGM && (
        <div className="flex items-center justify-center gap-2 px-4 py-2 border-b border-stone-800 bg-stone-900/20">
          <span className="text-[10px] text-stone-500 uppercase tracking-wider">Current Date:</span>
          <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 px-1.5" data-testid="badge-current-date">
            {monthNames[selectedCalendar?.currentMonth ?? 0] || "?"} {selectedCalendar?.currentDay ?? 1}, Year {selectedCalendar?.currentYear ?? 1}{yearSuffix ? ` ${yearSuffix}` : ""}
          </Badge>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-6 w-6 text-stone-500 hover:text-stone-300" onClick={() => advanceDay(-1)} title="Rewind 1 day" data-testid="button-rewind-day">
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] text-stone-400 hover:text-amber-400 px-1.5" onClick={goToCurrentDate} data-testid="button-go-to-today">
              <Star className="h-3 w-3 mr-0.5" /> Today
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-stone-500 hover:text-stone-300" onClick={() => advanceDay(1)} title="Advance 1 day" data-testid="button-advance-day">
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-4">
          <div className="grid gap-px bg-stone-800 rounded-lg overflow-hidden" style={{ gridTemplateColumns: `repeat(${weekDayNames.length}, minmax(0, 1fr))` }}>
            {weekDayNames.map((dayName, i) => (
              <div key={i} className="bg-stone-900 py-1.5 px-1 text-center">
                <span className="text-[10px] font-medium text-stone-500 uppercase tracking-wider">{dayName.slice(0, 3)}</span>
              </div>
            ))}
            {calendarGrid.flat().map((day, i) => {
              if (day === null) {
                return <div key={`empty-${i}`} className="bg-stone-950/50 min-h-[60px] md:min-h-[80px]" />;
              }
              const isCurrent = isCurrentDay(day);
              const dayEvents = eventsForDay(currentMonth, day);
              const dayNote = getDayNote(currentMonth, day);
              const dayHolidays = holidaysForDay(currentMonth, day);
              const hasContent = dayEvents.length > 0 || !!dayNote || dayHolidays.length > 0;

              return (
                <div
                  key={`day-${day}`}
                  className={`bg-stone-950/80 min-h-[60px] md:min-h-[80px] p-1 relative transition-colors cursor-pointer hover:bg-stone-900/80 ${isCurrent ? "ring-1 ring-amber-500/50 bg-amber-500/5" : ""}`}
                  onClick={() => handleDayClick(day)}
                  data-testid={`calendar-day-${day}`}
                >
                  <div className="flex items-start justify-between">
                    <span className={`text-xs font-medium ${isCurrent ? "text-amber-400" : "text-stone-400"}`}>
                      {day}
                    </span>
                    {hasContent && !isCurrent && (
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500/40 mt-0.5" />
                    )}
                    {isCurrent && (
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-0.5" />
                    )}
                  </div>
                  {dayHolidays.map((h, hi) => (
                    <div key={`h-${hi}`} className="mt-0.5 text-[8px] leading-tight px-0.5 py-px rounded truncate" style={{ backgroundColor: (h.color || "#ffb74d") + "22", color: h.color || "#ffb74d" }}>
                      {h.name}
                    </div>
                  ))}
                  {dayNote && (
                    <p className="text-[8px] text-stone-500 mt-0.5 line-clamp-2 leading-tight">{dayNote}</p>
                  )}
                  {dayEvents.slice(0, 2).map(ev => (
                    <div key={ev.id + ((ev as any)._fromCalendarName ? '-synced' : '')} className="mt-0.5 text-[8px] leading-tight px-0.5 py-px rounded truncate" style={{ backgroundColor: (ev.color || "#64b5f6") + "22", color: ev.color || "#64b5f6" }}>
                      {(ev as any)._fromCalendarName && <span className="opacity-60">[{(ev as any)._fromCalendarName}] </span>}
                      {ev.title}
                    </div>
                  ))}
                  {dayEvents.length > 2 && (
                    <span className="text-[8px] text-stone-500">+{dayEvents.length - 2} more</span>
                  )}
                </div>
              );
            })}
          </div>

          {calendarEvents.length > 0 && (
            <div className="mt-4 border-t border-stone-800 pt-3">
              <h4 className="text-xs font-medium text-stone-400 mb-2 uppercase tracking-wider">Events This Month</h4>
              <div className="space-y-1">
                {calendarEvents
                  .filter(e => {
                    if (!e.date) return false;
                    const parts = e.date.split("-");
                    return parts.length >= 1 && parseInt(parts[0], 10) === currentMonth + 1;
                  })
                  .sort((a, b) => {
                    const dayA = parseInt((a.date || "0-0").split("-")[1] || "0", 10);
                    const dayB = parseInt((b.date || "0-0").split("-")[1] || "0", 10);
                    return dayA - dayB;
                  })
                  .map(ev => (
                    <div key={ev.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-stone-900/50 border border-stone-800">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color || "#64b5f6" }} />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-stone-200 font-medium">{ev.title}</span>
                        {ev.date && (
                          <span className="text-[10px] text-stone-500 ml-2">
                            Day {ev.date.split("-")[1] || "?"}
                          </span>
                        )}
                      </div>
                      {ev.description && (
                        <span className="text-[10px] text-stone-500 truncate max-w-[150px]">{ev.description}</span>
                      )}
                    </div>
                  ))
                }
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {renderDialogs()}

      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 w-full max-w-[95vw] md:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-stone-100">Calendar Settings</DialogTitle>
          </DialogHeader>
          <CalendarForm
            name={formName}
            setName={setFormName}
            yearSuffix={formYearSuffix}
            setYearSuffix={setFormYearSuffix}
            monthNames={formMonthNames}
            setMonthNames={setFormMonthNames}
            daysPerMonth={formDaysPerMonth}
            setDaysPerMonth={setFormDaysPerMonth}
            weekDayNames={formWeekDayNames}
            setWeekDayNames={setFormWeekDayNames}
          />
          <DialogFooter>
            <Button variant="ghost" className="text-stone-400" onClick={() => setShowSettingsDialog(false)}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-500 text-white" onClick={handleUpdateSettings} disabled={updateCalendar.isPending} data-testid="button-confirm-update-calendar">
              {updateCalendar.isPending ? <LoadingLogo className="h-4 w-4 mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDayNoteDialog} onOpenChange={setShowDayNoteDialog}>
        <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-stone-100">
              {selectedDay ? `${monthNames[selectedDay.month] || `Month ${selectedDay.month + 1}`}, Day ${selectedDay.day}` : "Day Note"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {selectedDay && holidaysForDay(selectedDay.month, selectedDay.day).length > 0 && (
              <div>
                <h4 className="text-[10px] text-stone-500 uppercase tracking-wider mb-1">Holidays / Events</h4>
                {holidaysForDay(selectedDay.month, selectedDay.day).map((h, hi) => (
                  <div key={`hol-${hi}`} className="flex items-center gap-2 px-2 py-1 rounded bg-stone-800/50 mb-1">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: h.color || "#ffb74d" }} />
                    <span className="text-xs text-stone-300 flex-1">{h.name}</span>
                    {h.recurring !== false && <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400 px-1">Yearly</Badge>}
                    {h.description && <span className="text-[10px] text-stone-500 truncate max-w-[100px]">{h.description}</span>}
                  </div>
                ))}
              </div>
            )}
            {selectedDay && eventsForDay(selectedDay.month, selectedDay.day).length > 0 && (
              <div>
                <h4 className="text-[10px] text-stone-500 uppercase tracking-wider mb-1">Timeline Events</h4>
                {eventsForDay(selectedDay.month, selectedDay.day).map(ev => (
                  <div key={ev.id + ((ev as any)._fromCalendarName ? '-s' : '')} className="flex items-center gap-2 px-2 py-1 rounded bg-stone-800/50 mb-1">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color || "#64b5f6" }} />
                    <span className="text-xs text-stone-300">{ev.title}</span>
                    {(ev as any)._fromCalendarName && (
                      <Badge variant="outline" className="text-[9px] border-blue-500/30 text-blue-400 px-1">{(ev as any)._fromCalendarName}</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
            {isGM && selectedDay && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-amber-400 hover:text-amber-300 h-6 px-2"
                onClick={() => { setShowDayNoteDialog(false); openCreateEvent(selectedDay.month, selectedDay.day); }}
                data-testid="button-add-day-event"
              >
                <Plus className="h-3 w-3 mr-1" /> Add Holiday/Event
              </Button>
            )}
            {isGM ? (
              <div>
                <label className="text-xs text-stone-400 block mb-1">Note</label>
                <Textarea
                  value={dayNoteText}
                  onChange={e => setDayNoteText(e.target.value)}
                  className="bg-stone-800 border-stone-700 text-stone-200 text-xs min-h-[80px]"
                  placeholder="Add a note for this day..."
                  data-testid="input-day-note"
                />
              </div>
            ) : dayNoteText.trim() ? (
              <div>
                <h4 className="text-[10px] text-stone-500 uppercase tracking-wider mb-1">Note</h4>
                <p className="text-xs text-stone-300 bg-stone-800/50 rounded px-2 py-1.5 whitespace-pre-wrap">{dayNoteText}</p>
              </div>
            ) : null}
            {!isGM && selectedDay && holidaysForDay(selectedDay.month, selectedDay.day).length === 0 && eventsForDay(selectedDay.month, selectedDay.day).length === 0 && !dayNoteText.trim() && (
              <p className="text-xs text-stone-500 py-2">Nothing recorded for this day.</p>
            )}
          </div>
          <DialogFooter>
            {isGM ? (
              <>
                <Button variant="ghost" className="text-stone-400" onClick={() => setShowDayNoteDialog(false)}>Cancel</Button>
                <Button className="bg-amber-600 hover:bg-amber-500 text-white" onClick={saveDayNote} disabled={updateCalendar.isPending} data-testid="button-save-day-note">
                  Save
                </Button>
              </>
            ) : (
              <Button variant="ghost" className="text-stone-400" onClick={() => setShowDayNoteDialog(false)}>Close</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEventDialog} onOpenChange={setShowEventDialog}>
        <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 max-w-sm" data-testid="calendar-event-form">
          <DialogHeader>
            <DialogTitle className="text-stone-100">
              {editingEventIdx !== null ? "Edit Event/Holiday" : "Create Event/Holiday"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-stone-400 mb-1 block">Name *</label>
              <Input
                value={eventFormName}
                onChange={(e) => setEventFormName(e.target.value)}
                placeholder="e.g. Midsummer Festival"
                className="bg-stone-800 border-stone-700 text-stone-200"
                data-testid="input-cal-event-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-stone-400 mb-1 block">Month</label>
                <Select value={String(eventFormMonth)} onValueChange={(v) => setEventFormMonth(parseInt(v, 10))}>
                  <SelectTrigger className="bg-stone-800 border-stone-700 text-stone-200 text-xs" data-testid="select-cal-event-month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-stone-800 border-stone-700 max-h-48">
                    {((selectedCalendar?.monthNames as string[]) || []).map((m, i) => (
                      <SelectItem key={i} value={String(i)} className="text-stone-200 text-xs">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-stone-400 mb-1 block">Day</label>
                <Input
                  type="number"
                  min={1}
                  max={((selectedCalendar?.daysPerMonth as number[]) || [])[eventFormMonth] || 30}
                  value={eventFormDay}
                  onChange={(e) => setEventFormDay(parseInt(e.target.value, 10) || 1)}
                  className="bg-stone-800 border-stone-700 text-stone-200"
                  data-testid="input-cal-event-day"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-stone-400 mb-1 block">Description</label>
              <Textarea
                value={eventFormDescription}
                onChange={(e) => setEventFormDescription(e.target.value)}
                placeholder="Optional description..."
                className="bg-stone-800 border-stone-700 text-stone-200 min-h-[50px] text-xs"
                data-testid="input-cal-event-description"
              />
            </div>
            <div>
              <label className="text-xs text-stone-400 mb-1 block">Color</label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={eventFormColor}
                  onChange={(e) => setEventFormColor(e.target.value)}
                  className="w-8 h-8 p-0 border-0 bg-transparent cursor-pointer"
                  data-testid="input-cal-event-color"
                />
                <div className="flex gap-1 flex-wrap flex-1">
                  {["#ffb74d", "#e57373", "#81c784", "#64b5f6", "#ce93d8", "#4db6ac", "#fff176", "#a1887f"].map(c => (
                    <button
                      key={c}
                      className={`w-5 h-5 rounded-full border-2 transition-all ${eventFormColor === c ? 'border-white scale-110' : 'border-transparent hover:border-stone-500'}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setEventFormColor(c)}
                    />
                  ))}
                </div>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={eventFormRecurring}
                onChange={(e) => setEventFormRecurring(e.target.checked)}
                className="rounded border-stone-600 bg-stone-800 text-amber-500"
                data-testid="checkbox-recurring"
              />
              <span className="text-xs text-stone-300">Recurring yearly</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="text-stone-400" onClick={() => setShowEventDialog(false)}>Cancel</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-500 text-white"
              onClick={handleSaveEvent}
              disabled={!eventFormName.trim() || updateCalendar.isPending}
              data-testid="button-save-cal-event"
            >
              {updateCalendar.isPending && <LoadingLogo className="h-3.5 w-3.5 mr-1.5" />}
              {editingEventIdx !== null ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showJumpDialog} onOpenChange={setShowJumpDialog}>
        <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 max-w-xs" data-testid="jump-date-dialog">
          <DialogHeader>
            <DialogTitle className="text-stone-100">Jump to Date</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-stone-400 mb-1 block">Month</label>
              <div className="grid grid-cols-3 gap-1.5">
                {monthNames.map((m, i) => (
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

      <Dialog open={showSyncDialog} onOpenChange={setShowSyncDialog}>
        <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 w-full max-w-[95vw] md:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-stone-100 flex items-center gap-2">
              <Link2 className="h-4 w-4 text-blue-400" />
              Sync Calendars
            </DialogTitle>
          </DialogHeader>

          {syncsForCurrentCalendar.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs text-stone-400 uppercase tracking-wider">Active Syncs</label>
              {syncsForCurrentCalendar.map(sync => {
                const otherId = sync.sourceCalendarId === selectedCalendar?.id ? sync.targetCalendarId : sync.sourceCalendarId;
                const otherCal = calendars.find(c => c.id === otherId);
                return (
                  <div key={sync.id} className="flex items-center justify-between px-3 py-2 rounded bg-stone-800/60 border border-stone-700" data-testid={`sync-entry-${sync.id}`}>
                    <div className="flex items-center gap-2">
                      <Link2 className="h-3 w-3 text-blue-400" />
                      <span className="text-xs text-stone-300">{otherCal?.name || "Unknown"}</span>
                      <Badge variant="outline" className="text-[9px] border-stone-600 text-stone-500">
                        offset: {sync.epochOffset > 0 ? "+" : ""}{sync.epochOffset}d
                      </Badge>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-stone-500 hover:text-red-400" onClick={() => handleDeleteSync(sync.id)} data-testid={`button-remove-sync-${sync.id}`}>
                      <Unlink className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-3 border-t border-stone-800 pt-3">
            <label className="text-xs text-stone-400 uppercase tracking-wider">Create New Sync</label>
            <div>
              <label className="text-xs text-stone-500 mb-1 block">Sync {selectedCalendar?.name} with:</label>
              <Select value={syncTargetCalendarId || "none"} onValueChange={(v) => setSyncTargetCalendarId(v === "none" ? "" : v)}>
                <SelectTrigger className="bg-stone-800 border-stone-700 text-stone-200 text-xs" data-testid="select-sync-target">
                  <SelectValue placeholder="Select calendar" />
                </SelectTrigger>
                <SelectContent className="bg-stone-800 border-stone-700">
                  <SelectItem value="none" className="text-stone-500 text-xs">Select a calendar</SelectItem>
                  {calendars
                    .filter(c => c.id !== selectedCalendar?.id && !syncsForCurrentCalendar.some(s => s.sourceCalendarId === c.id || s.targetCalendarId === c.id))
                    .map(c => (
                      <SelectItem key={c.id} value={c.id} className="text-stone-200 text-xs">{c.name}</SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
            </div>

            {syncTargetCalendarId && selectedCalendar && (() => {
              const targetCal = calendars.find(c => c.id === syncTargetCalendarId);
              if (!targetCal) return null;
              const srcMonths = (selectedCalendar.monthNames as string[]) || [];
              const tgtMonths = (targetCal.monthNames as string[]) || [];
              return (
                <div className="space-y-3 bg-stone-800/30 rounded p-3 border border-stone-700/50">
                  <p className="text-[10px] text-stone-500">Align dates: specify which date on each calendar corresponds to the same real moment.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-amber-400 font-medium">{selectedCalendar.name}</label>
                      <Select value={String(syncAlignSourceDate.month)} onValueChange={v => setSyncAlignSourceDate(d => ({ ...d, month: parseInt(v) }))}>
                        <SelectTrigger className="bg-stone-800 border-stone-700 text-stone-200 text-xs h-7" data-testid="sync-source-month">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-stone-800 border-stone-700 max-h-48">
                          {srcMonths.map((m, i) => (
                            <SelectItem key={i} value={String(i)} className="text-stone-200 text-xs">{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="grid grid-cols-2 gap-1">
                        <Input type="number" min={1} value={syncAlignSourceDate.day} onChange={e => setSyncAlignSourceDate(d => ({ ...d, day: parseInt(e.target.value) || 1 }))} placeholder="Day" className="bg-stone-800 border-stone-700 text-stone-200 text-xs h-7" data-testid="sync-source-day" />
                        <Input type="number" value={syncAlignSourceDate.year} onChange={e => setSyncAlignSourceDate(d => ({ ...d, year: parseInt(e.target.value) || 1 }))} placeholder="Year" className="bg-stone-800 border-stone-700 text-stone-200 text-xs h-7" data-testid="sync-source-year" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-blue-400 font-medium">{targetCal.name}</label>
                      <Select value={String(syncAlignTargetDate.month)} onValueChange={v => setSyncAlignTargetDate(d => ({ ...d, month: parseInt(v) }))}>
                        <SelectTrigger className="bg-stone-800 border-stone-700 text-stone-200 text-xs h-7" data-testid="sync-target-month">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-stone-800 border-stone-700 max-h-48">
                          {tgtMonths.map((m, i) => (
                            <SelectItem key={i} value={String(i)} className="text-stone-200 text-xs">{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="grid grid-cols-2 gap-1">
                        <Input type="number" min={1} value={syncAlignTargetDate.day} onChange={e => setSyncAlignTargetDate(d => ({ ...d, day: parseInt(e.target.value) || 1 }))} placeholder="Day" className="bg-stone-800 border-stone-700 text-stone-200 text-xs h-7" data-testid="sync-target-day" />
                        <Input type="number" value={syncAlignTargetDate.year} onChange={e => setSyncAlignTargetDate(d => ({ ...d, year: parseInt(e.target.value) || 1 }))} placeholder="Year" className="bg-stone-800 border-stone-700 text-stone-200 text-xs h-7" data-testid="sync-target-year" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          <DialogFooter>
            <Button variant="ghost" className="text-stone-400" onClick={() => setShowSyncDialog(false)}>Close</Button>
            {syncTargetCalendarId && (
              <Button className="bg-blue-600 hover:bg-blue-500 text-white" onClick={handleCreateSync} disabled={createSync.isPending} data-testid="button-confirm-sync">
                {createSync.isPending ? <LoadingLogo className="h-4 w-4 mr-2" /> : <Link2 className="h-4 w-4 mr-2" />}
                Sync
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CalendarForm({
  name, setName,
  yearSuffix, setYearSuffix,
  monthNames, setMonthNames,
  daysPerMonth, setDaysPerMonth,
  weekDayNames, setWeekDayNames,
}: {
  name: string; setName: (v: string) => void;
  yearSuffix: string; setYearSuffix: (v: string) => void;
  monthNames: string[]; setMonthNames: (v: string[]) => void;
  daysPerMonth: number[]; setDaysPerMonth: (v: number[]) => void;
  weekDayNames: string[]; setWeekDayNames: (v: string[]) => void;
}) {
  const addMonth = () => {
    setMonthNames([...monthNames, `Month ${monthNames.length + 1}`]);
    setDaysPerMonth([...daysPerMonth, 30]);
  };

  const removeMonth = (idx: number) => {
    setMonthNames(monthNames.filter((_, i) => i !== idx));
    setDaysPerMonth(daysPerMonth.filter((_, i) => i !== idx));
  };

  const addWeekDay = () => {
    setWeekDayNames([...weekDayNames, `Day ${weekDayNames.length + 1}`]);
  };

  const removeWeekDay = (idx: number) => {
    setWeekDayNames(weekDayNames.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-stone-400 block mb-1">Calendar Name</label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            className="bg-stone-800 border-stone-700 text-stone-200 text-sm"
            placeholder="e.g., Harptos Calendar"
            data-testid="input-calendar-name"
          />
        </div>
        <div>
          <label className="text-xs text-stone-400 block mb-1">Year Suffix (optional)</label>
          <Input
            value={yearSuffix}
            onChange={e => setYearSuffix(e.target.value)}
            className="bg-stone-800 border-stone-700 text-stone-200 text-sm"
            placeholder="e.g., DR, AE, etc."
            data-testid="input-year-suffix"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-stone-400">Weekday Names</label>
            <Button variant="ghost" size="sm" className="h-5 text-[10px] text-amber-400 hover:text-amber-300 px-1" onClick={addWeekDay}>
              <Plus className="h-2.5 w-2.5 mr-0.5" /> Add
            </Button>
          </div>
          <div className="space-y-1">
            {weekDayNames.map((day, i) => (
              <div key={i} className="flex items-center gap-1">
                <Input
                  value={day}
                  onChange={e => {
                    const copy = [...weekDayNames];
                    copy[i] = e.target.value;
                    setWeekDayNames(copy);
                  }}
                  className="bg-stone-800 border-stone-700 text-stone-200 text-xs h-7 flex-1"
                  data-testid={`input-weekday-${i}`}
                />
                {weekDayNames.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-stone-500 hover:text-red-400 flex-shrink-0" onClick={() => removeWeekDay(i)}>
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-stone-400">Months</label>
            <Button variant="ghost" size="sm" className="h-5 text-[10px] text-amber-400 hover:text-amber-300 px-1" onClick={addMonth}>
              <Plus className="h-2.5 w-2.5 mr-0.5" /> Add
            </Button>
          </div>
          <div className="space-y-1">
            {monthNames.map((month, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className="text-[10px] text-stone-600 w-5 text-right flex-shrink-0">{i + 1}</span>
                <Input
                  value={month}
                  onChange={e => {
                    const copy = [...monthNames];
                    copy[i] = e.target.value;
                    setMonthNames(copy);
                  }}
                  className="bg-stone-800 border-stone-700 text-stone-200 text-xs h-7 flex-1"
                  placeholder={`Month ${i + 1}`}
                  data-testid={`input-month-name-${i}`}
                />
                <Input
                  type="number"
                  value={daysPerMonth[i] || 30}
                  onChange={e => {
                    const copy = [...daysPerMonth];
                    copy[i] = parseInt(e.target.value, 10) || 1;
                    setDaysPerMonth(copy);
                  }}
                  className="bg-stone-800 border-stone-700 text-stone-200 text-xs h-7 w-16"
                  min={1}
                  max={100}
                  data-testid={`input-days-per-month-${i}`}
                />
                <span className="text-[10px] text-stone-600 flex-shrink-0">days</span>
                {monthNames.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-stone-500 hover:text-red-400 flex-shrink-0" onClick={() => removeMonth(i)}>
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}