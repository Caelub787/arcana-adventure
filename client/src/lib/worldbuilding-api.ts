import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { gameWs } from "@/lib/api";

export interface Entity {
  id: string;
  campaignId: string;
  entityType: string;
  displayName: string;
  description?: string | null;
  image?: string | null;
  sheetId?: string | null;
  notePageId?: string | null;
  visibility: string;
  tags?: string[] | null;
  loreFields?: Record<string, any> | null;
  questData?: Record<string, any> | null;
  eventData?: Record<string, any> | null;
  clueData?: Record<string, any> | null;
  locationData?: Record<string, any> | null;
  factionData?: Record<string, any> | null;
  encounterData?: Record<string, any> | null;
  articleContent?: string | null;
  magicData?: Record<string, any> | null;
  timelineData?: Record<string, any> | null;
  isDeleted: boolean;
  deletedAt?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EntityLink {
  id: string;
  campaignId: string;
  fromEntityId: string;
  toEntityId: string;
  linkType: string;
  label?: string | null;
  metadata?: Record<string, any> | null;
  createdAt: string;
}

async function fetchJSON(url: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
    credentials: "include",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export function useEntities(worldId: string | undefined) {
  return useQuery<Entity[]>({
    queryKey: ["/api/worlds", worldId, "entities"],
    queryFn: () => fetchJSON(`/api/worlds/${worldId}/entities`),
    enabled: !!worldId,
  });
}

export function useEntitiesByCampaign(campaignId: string | undefined) {
  return useQuery<Entity[]>({
    queryKey: ["/api/campaigns", campaignId, "entities"],
    queryFn: () => fetchJSON(`/api/campaigns/${campaignId}/entities`),
    enabled: !!campaignId,
  });
}

export function useEntity(worldId: string | undefined, entityId: string | undefined) {
  return useQuery<Entity>({
    queryKey: ["/api/worlds", worldId, "entities", entityId],
    queryFn: () => fetchJSON(`/api/worlds/${worldId}/entities/${entityId}`),
    enabled: !!worldId && !!entityId,
  });
}

export function useSearchEntities(worldId: string | undefined, query: string, entityType?: string) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (entityType) params.set("type", entityType);
  return useQuery<Entity[]>({
    queryKey: ["/api/worlds", worldId, "entities", "search", query, entityType],
    queryFn: () => fetchJSON(`/api/worlds/${worldId}/entities/search?${params}`),
    enabled: !!worldId && query.length > 0,
  });
}

export function useEntityLinks(worldId: string | undefined, entityId?: string) {
  const url = entityId
    ? `/api/worlds/${worldId}/entity-links/entity/${entityId}`
    : `/api/worlds/${worldId}/entity-links`;
  return useQuery<EntityLink[]>({
    queryKey: ["/api/worlds", worldId, "entity-links", entityId || "all"],
    queryFn: () => fetchJSON(url),
    enabled: !!worldId,
  });
}

export function useEntityReferences(worldId: string | undefined, entityId: string | undefined) {
  return useQuery({
    queryKey: ["/api/worlds", worldId, "entities", entityId, "references"],
    queryFn: () => fetchJSON(`/api/worlds/${worldId}/entities/${entityId}/references`),
    enabled: !!worldId && !!entityId,
  });
}

export function useCreateEntity(worldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Entity>) =>
      fetchJSON(`/api/worlds/${worldId}/entities`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/worlds", worldId, "entities"] });
    },
  });
}

export function useUpdateEntity(worldId: string | undefined, scope: "worlds" | "campaigns" = "worlds") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Entity> & { id: string }) =>
      fetchJSON(`/api/${scope}/${worldId}/entities/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/${scope}`, worldId, "entities"] });
    },
  });
}

export function useDeleteEntity(worldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entityId: string) =>
      fetchJSON(`/api/worlds/${worldId}/entities/${entityId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/worlds", worldId, "entities"] });
    },
  });
}

export function useCreateEntityLink(worldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<EntityLink>) =>
      fetchJSON(`/api/worlds/${worldId}/entity-links`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/worlds", worldId, "entity-links"] });
    },
  });
}

export function useDeleteEntityLink(worldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) =>
      fetchJSON(`/api/worlds/${worldId}/entity-links/${linkId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/worlds", worldId, "entity-links"] });
    },
  });
}

export const ENTITY_TYPE_CONFIG: Record<string, { label: string; pluralLabel: string; color: string; icon: string }> = {
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

export interface WorldMap {
  id: string;
  campaignId: string;
  title: string;
  imageUrl?: string | null;
  description?: string | null;
  parentMapId?: string | null;
  visibility: string;
  sortOrder?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorldMapPin {
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
  createdAt: string;
}

export function useWorldMaps(worldId: string | undefined) {
  return useQuery<WorldMap[]>({
    queryKey: ["/api/worlds", worldId, "world-maps"],
    queryFn: () => fetchJSON(`/api/worlds/${worldId}/world-maps`),
    enabled: !!worldId,
  });
}

export function useWorldMap(worldId: string | undefined, mapId: string | undefined) {
  return useQuery<WorldMap>({
    queryKey: ["/api/worlds", worldId, "world-maps", mapId],
    queryFn: () => fetchJSON(`/api/worlds/${worldId}/world-maps/${mapId}`),
    enabled: !!worldId && !!mapId,
  });
}

export function useWorldMapPins(worldId: string | undefined, mapId: string | undefined) {
  return useQuery<WorldMapPin[]>({
    queryKey: ["/api/worlds", worldId, "world-maps", mapId, "pins"],
    queryFn: () => fetchJSON(`/api/worlds/${worldId}/world-maps/${mapId}/pins`),
    enabled: !!worldId && !!mapId,
  });
}

export function useCreateWorldMap(worldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<WorldMap>) =>
      fetchJSON(`/api/worlds/${worldId}/world-maps`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/worlds", worldId, "world-maps"] });
    },
  });
}

export function useUpdateWorldMap(worldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<WorldMap> & { id: string }) =>
      fetchJSON(`/api/worlds/${worldId}/world-maps/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/worlds", worldId, "world-maps"] });
    },
  });
}

export function useDeleteWorldMap(worldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mapId: string) =>
      fetchJSON(`/api/worlds/${worldId}/world-maps/${mapId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/worlds", worldId, "world-maps"] });
    },
  });
}

export function useCreateWorldMapPin(worldId: string | undefined, mapId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<WorldMapPin>) =>
      fetchJSON(`/api/worlds/${worldId}/world-maps/${mapId}/pins`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/worlds", worldId, "world-maps", mapId, "pins"] });
    },
  });
}

export function useUpdateWorldMapPin(worldId: string | undefined, mapId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<WorldMapPin> & { id: string }) =>
      fetchJSON(`/api/worlds/${worldId}/world-maps/${mapId}/pins/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/worlds", worldId, "world-maps", mapId, "pins"] });
    },
  });
}

export function useDeleteWorldMapPin(worldId: string | undefined, mapId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pinId: string) =>
      fetchJSON(`/api/worlds/${worldId}/world-maps/${mapId}/pins/${pinId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/worlds", worldId, "world-maps", mapId, "pins"] });
    },
  });
}

export interface WorldTimelineEvent {
  id: string;
  campaignId: string;
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
  createdAt: string;
}

export interface WorldCalendar {
  id: string;
  campaignId: string;
  name: string;
  monthNames: string[];
  daysPerMonth: number[];
  weekDayNames: string[];
  currentYear?: number | null;
  currentMonth?: number | null;
  currentDay?: number | null;
  yearSuffix?: string | null;
  notes?: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}

export function useTimelineEvents(worldId: string | undefined) {
  return useQuery<WorldTimelineEvent[]>({
    queryKey: ["/api/worlds", worldId, "timeline-events"],
    queryFn: () => fetchJSON(`/api/worlds/${worldId}/timeline-events`),
    enabled: !!worldId,
  });
}

export function useCreateTimelineEvent(worldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<WorldTimelineEvent>) =>
      fetchJSON(`/api/worlds/${worldId}/timeline-events`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/worlds", worldId, "timeline-events"] });
    },
  });
}

export function useUpdateTimelineEvent(worldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<WorldTimelineEvent> & { id: string }) =>
      fetchJSON(`/api/worlds/${worldId}/timeline-events/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/worlds", worldId, "timeline-events"] });
    },
  });
}

export function useDeleteTimelineEvent(worldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) =>
      fetchJSON(`/api/worlds/${worldId}/timeline-events/${eventId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/worlds", worldId, "timeline-events"] });
    },
  });
}

export function useCalendars(worldId: string | undefined) {
  return useQuery<WorldCalendar[]>({
    queryKey: ["/api/worlds", worldId, "calendars"],
    queryFn: () => fetchJSON(`/api/worlds/${worldId}/calendars`),
    enabled: !!worldId,
  });
}

export function useCreateCalendar(worldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<WorldCalendar>) =>
      fetchJSON(`/api/worlds/${worldId}/calendars`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/worlds', worldId, 'calendars'] });
    },
  });
}

export function useUpdateCalendar(worldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<WorldCalendar> & { id: string }) =>
      fetchJSON(`/api/worlds/${worldId}/calendars/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/worlds', worldId, 'calendars'] });
    },
  });
}

export function useDeleteCalendar(worldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (calendarId: string) =>
      fetchJSON(`/api/worlds/${worldId}/calendars/${calendarId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/worlds', worldId, 'calendars'] });
    },
  });
}

export interface WorldCalendarSync {
  id: string;
  worldId: string;
  sourceCalendarId: string;
  targetCalendarId: string;
  epochOffset: number;
  createdAt: string;
}

export function useCalendarSyncs(worldId: string | undefined) {
  return useQuery<WorldCalendarSync[]>({
    queryKey: ["/api/worlds", worldId, "calendar-syncs"],
    queryFn: () => fetchJSON(`/api/worlds/${worldId}/calendar-syncs`),
    enabled: !!worldId,
  });
}

export function useCreateCalendarSync(worldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { sourceCalendarId: string; targetCalendarId: string; epochOffset: number }) =>
      fetchJSON(`/api/worlds/${worldId}/calendar-syncs`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/worlds', worldId, 'calendar-syncs'] });
    },
  });
}

export function useDeleteCalendarSync(worldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (syncId: string) =>
      fetchJSON(`/api/worlds/${worldId}/calendar-syncs/${syncId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/worlds', worldId, 'calendar-syncs'] });
    },
  });
}

export function useWorldbuildingSync(worldId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!worldId) return;

    const unsubscribe = gameWs.onMessage((data: any) => {
      if (['entity_created', 'entity_updated', 'entity_deleted', 'entity_restored'].includes(data.type)) {
        qc.invalidateQueries({ queryKey: ["/api/worlds", worldId, "entities"] });
      }
      if (['entity_link_created', 'entity_link_updated', 'entity_link_deleted'].includes(data.type)) {
        qc.invalidateQueries({ queryKey: ["/api/worlds", worldId, "entity-links"] });
      }
      if (['world_map_created', 'world_map_updated', 'world_map_deleted'].includes(data.type)) {
        qc.invalidateQueries({ queryKey: ["/api/worlds", worldId, "world-maps"] });
      }
      if (['world_map_pin_created', 'world_map_pin_updated', 'world_map_pin_deleted'].includes(data.type)) {
        const mapId = data.mapId;
        if (mapId) {
          qc.invalidateQueries({ queryKey: ["/api/worlds", worldId, "world-maps", mapId, "pins"] });
        }
      }
      if (['world_calendar_created', 'world_calendar_updated', 'world_calendar_deleted'].includes(data.type)) {
        qc.invalidateQueries({ queryKey: ['/api/worlds', worldId, 'calendars'] });
      }
      if (['world_timeline_event_created', 'world_timeline_event_updated', 'world_timeline_event_deleted'].includes(data.type)) {
        qc.invalidateQueries({ queryKey: ["/api/worlds", worldId, "timeline-events"] });
      }
      if (['calendar_sync_created', 'calendar_sync_deleted'].includes(data.type)) {
        qc.invalidateQueries({ queryKey: ['/api/worlds', worldId, 'calendar-syncs'] });
      }
    });

    return () => { unsubscribe?.(); };
  }, [worldId, qc]);
}

export const LINK_TYPE_LABELS: Record<string, string> = {
  ally: "Ally",
  enemy: "Enemy",
  member_of: "Member Of",
  located_in: "Located In",
  related_to: "Related To",
  quest_target: "Quest Target",
  quest_giver: "Quest Giver",
  owns: "Owns",
  controls: "Controls",
  parent_of: "Parent Of",
  child_of: "Child Of",
  employs: "Employs",
  guards: "Guards",
  trades_with: "Trades With",
  worships: "Worships",
  rivals: "Rivals",
  mentor_of: "Mentor Of",
  student_of: "Student Of",
  found_at: "Found At",
  found_from: "Found From",
  related_quest: "Related Quest",
  custom: "Custom",
};
