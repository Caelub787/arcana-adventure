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

export function useEntities(campaignId: string | undefined) {
  return useQuery<Entity[]>({
    queryKey: ["/api/campaigns", campaignId, "entities"],
    queryFn: () => fetchJSON(`/api/campaigns/${campaignId}/entities`),
    enabled: !!campaignId,
  });
}

export function useEntity(campaignId: string | undefined, entityId: string | undefined) {
  return useQuery<Entity>({
    queryKey: ["/api/campaigns", campaignId, "entities", entityId],
    queryFn: () => fetchJSON(`/api/campaigns/${campaignId}/entities/${entityId}`),
    enabled: !!campaignId && !!entityId,
  });
}

export function useSearchEntities(campaignId: string | undefined, query: string, entityType?: string) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (entityType) params.set("type", entityType);
  return useQuery<Entity[]>({
    queryKey: ["/api/campaigns", campaignId, "entities", "search", query, entityType],
    queryFn: () => fetchJSON(`/api/campaigns/${campaignId}/entities/search?${params}`),
    enabled: !!campaignId && query.length > 0,
  });
}

export function useEntityLinks(campaignId: string | undefined, entityId?: string) {
  const url = entityId
    ? `/api/campaigns/${campaignId}/entity-links/entity/${entityId}`
    : `/api/campaigns/${campaignId}/entity-links`;
  return useQuery<EntityLink[]>({
    queryKey: ["/api/campaigns", campaignId, "entity-links", entityId || "all"],
    queryFn: () => fetchJSON(url),
    enabled: !!campaignId,
  });
}

export function useEntityReferences(campaignId: string | undefined, entityId: string | undefined) {
  return useQuery({
    queryKey: ["/api/campaigns", campaignId, "entities", entityId, "references"],
    queryFn: () => fetchJSON(`/api/campaigns/${campaignId}/entities/${entityId}/references`),
    enabled: !!campaignId && !!entityId,
  });
}

export function useCreateEntity(campaignId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Entity>) =>
      fetchJSON(`/api/campaigns/${campaignId}/entities`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "entities"] });
    },
  });
}

export function useUpdateEntity(campaignId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Entity> & { id: string }) =>
      fetchJSON(`/api/campaigns/${campaignId}/entities/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "entities"] });
    },
  });
}

export function useDeleteEntity(campaignId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entityId: string) =>
      fetchJSON(`/api/campaigns/${campaignId}/entities/${entityId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "entities"] });
    },
  });
}

export function useCreateEntityLink(campaignId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<EntityLink>) =>
      fetchJSON(`/api/campaigns/${campaignId}/entity-links`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "entity-links"] });
    },
  });
}

export function useDeleteEntityLink(campaignId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) =>
      fetchJSON(`/api/campaigns/${campaignId}/entity-links/${linkId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "entity-links"] });
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

export function useWorldMaps(campaignId: string | undefined) {
  return useQuery<WorldMap[]>({
    queryKey: ["/api/campaigns", campaignId, "world-maps"],
    queryFn: () => fetchJSON(`/api/campaigns/${campaignId}/world-maps`),
    enabled: !!campaignId,
  });
}

export function useWorldMap(campaignId: string | undefined, mapId: string | undefined) {
  return useQuery<WorldMap>({
    queryKey: ["/api/campaigns", campaignId, "world-maps", mapId],
    queryFn: () => fetchJSON(`/api/campaigns/${campaignId}/world-maps/${mapId}`),
    enabled: !!campaignId && !!mapId,
  });
}

export function useWorldMapPins(campaignId: string | undefined, mapId: string | undefined) {
  return useQuery<WorldMapPin[]>({
    queryKey: ["/api/campaigns", campaignId, "world-maps", mapId, "pins"],
    queryFn: () => fetchJSON(`/api/campaigns/${campaignId}/world-maps/${mapId}/pins`),
    enabled: !!campaignId && !!mapId,
  });
}

export function useCreateWorldMap(campaignId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<WorldMap>) =>
      fetchJSON(`/api/campaigns/${campaignId}/world-maps`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "world-maps"] });
    },
  });
}

export function useUpdateWorldMap(campaignId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<WorldMap> & { id: string }) =>
      fetchJSON(`/api/campaigns/${campaignId}/world-maps/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "world-maps"] });
    },
  });
}

export function useDeleteWorldMap(campaignId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mapId: string) =>
      fetchJSON(`/api/campaigns/${campaignId}/world-maps/${mapId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "world-maps"] });
    },
  });
}

export function useCreateWorldMapPin(campaignId: string | undefined, mapId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<WorldMapPin>) =>
      fetchJSON(`/api/campaigns/${campaignId}/world-maps/${mapId}/pins`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "world-maps", mapId, "pins"] });
    },
  });
}

export function useUpdateWorldMapPin(campaignId: string | undefined, mapId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<WorldMapPin> & { id: string }) =>
      fetchJSON(`/api/campaigns/${campaignId}/world-maps/${mapId}/pins/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "world-maps", mapId, "pins"] });
    },
  });
}

export function useDeleteWorldMapPin(campaignId: string | undefined, mapId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pinId: string) =>
      fetchJSON(`/api/campaigns/${campaignId}/world-maps/${mapId}/pins/${pinId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "world-maps", mapId, "pins"] });
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

export function useTimelineEvents(campaignId: string | undefined) {
  return useQuery<WorldTimelineEvent[]>({
    queryKey: ["/api/campaigns", campaignId, "timeline-events"],
    queryFn: () => fetchJSON(`/api/campaigns/${campaignId}/timeline-events`),
    enabled: !!campaignId,
  });
}

export function useCreateTimelineEvent(campaignId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<WorldTimelineEvent>) =>
      fetchJSON(`/api/campaigns/${campaignId}/timeline-events`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "timeline-events"] });
    },
  });
}

export function useUpdateTimelineEvent(campaignId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<WorldTimelineEvent> & { id: string }) =>
      fetchJSON(`/api/campaigns/${campaignId}/timeline-events/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "timeline-events"] });
    },
  });
}

export function useDeleteTimelineEvent(campaignId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) =>
      fetchJSON(`/api/campaigns/${campaignId}/timeline-events/${eventId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "timeline-events"] });
    },
  });
}

export function useCalendars(campaignId: string | undefined) {
  return useQuery<WorldCalendar[]>({
    queryKey: ["/api/campaigns", campaignId, "calendars"],
    queryFn: () => fetchJSON(`/api/campaigns/${campaignId}/calendars`),
    enabled: !!campaignId,
  });
}

export function useCreateCalendar(campaignId: string | undefined) {
        const qc = useQueryClient();
        return useMutation({
                mutationFn: (data: Partial<WorldCalendar>) =>
                        fetchJSON(`/api/campaigns/${campaignId}/calendars`, {
                                method: 'POST',
                                body: JSON.stringify(data),
                        }),
                onSuccess: () => {
                        qc.invalidateQueries({ queryKey: ['/api/campaigns', campaignId, 'calendars'] });
                },
        });
}

export function useUpdateCalendar(campaignId: string | undefined) {
        const qc = useQueryClient();
        return useMutation({
                mutationFn: ({ id, ...data }: Partial<WorldCalendar> & { id: string }) =>
                        fetchJSON(`/api/campaigns/${campaignId}/calendars/${id}`, {
                                method: 'PATCH',
                                body: JSON.stringify(data),
                        }),
                onSuccess: () => {
                        qc.invalidateQueries({ queryKey: ['/api/campaigns', campaignId, 'calendars'] });
                },
        });
}

export function useDeleteCalendar(campaignId: string | undefined) {
        const qc = useQueryClient();
        return useMutation({
                mutationFn: (calendarId: string) =>
                        fetchJSON(`/api/campaigns/${campaignId}/calendars/${calendarId}`, {
                                method: 'DELETE',
                        }),
                onSuccess: () => {
                        qc.invalidateQueries({ queryKey: ['/api/campaigns', campaignId, 'calendars'] });
                },
        });
}

export function useWorldbuildingSync(campaignId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!campaignId) return;

    const unsubscribe = gameWs.onMessage((data: any) => {
      if (['entity_created', 'entity_updated', 'entity_deleted', 'entity_restored'].includes(data.type)) {
        qc.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "entities"] });
      }
      if (['entity_link_created', 'entity_link_updated', 'entity_link_deleted'].includes(data.type)) {
        qc.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "entity-links"] });
      }
      if (['world_map_created', 'world_map_updated', 'world_map_deleted'].includes(data.type)) {
        qc.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "world-maps"] });
      }
      if (['world_map_pin_created', 'world_map_pin_updated', 'world_map_pin_deleted'].includes(data.type)) {
        const mapId = data.mapId;
        if (mapId) {
          qc.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "world-maps", mapId, "pins"] });
        }
      }
      if (['world_calendar_created', 'world_calendar_updated', 'world_calendar_deleted'].includes(data.type)) {
        qc.invalidateQueries({ queryKey: ['/api/campaigns', campaignId, 'calendars'] });
      }
      if (['world_timeline_event_created', 'world_timeline_event_updated', 'world_timeline_event_deleted'].includes(data.type)) {
        qc.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "timeline-events"] });
      }
    });

    return () => { unsubscribe?.(); };
  }, [campaignId, qc]);
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
