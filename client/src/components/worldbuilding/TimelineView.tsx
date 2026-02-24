import React, { useMemo } from "react";
import { type Entity, ENTITY_TYPE_CONFIG } from "@/lib/worldbuilding-api";
import { Badge } from "@/components/ui/badge";
import { Clock, Calendar, ChevronRight } from "lucide-react";

interface TimelineViewProps {
  entities: Entity[];
  onSelectEntity: (entityId: string) => void;
}

interface TimelineEvent {
  entity: Entity;
  date: string;
  era: string;
  sortKey: string;
}

export function TimelineView({ entities, onSelectEntity }: TimelineViewProps) {
  const timelineEvents = useMemo(() => {
    const events: TimelineEvent[] = [];

    entities.forEach(entity => {
      if (entity.entityType === "timeline" && entity.timelineData) {
        const data = entity.timelineData as any;
        events.push({
          entity,
          date: data.startDate || "",
          era: data.era || "Unknown Era",
          sortKey: data.startDate || entity.displayName,
        });
      } else if (entity.entityType === "event" && entity.loreFields) {
        const data = entity.loreFields as any;
        events.push({
          entity,
          date: data.date || "",
          era: data.era || "Unknown Era",
          sortKey: data.date || entity.displayName,
        });
      }
    });

    return events.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [entities]);

  const groupedByEra = useMemo(() => {
    const groups: Record<string, TimelineEvent[]> = {};
    timelineEvents.forEach(event => {
      if (!groups[event.era]) groups[event.era] = [];
      groups[event.era].push(event);
    });
    return Object.entries(groups);
  }, [timelineEvents]);

  if (timelineEvents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-stone-500" data-testid="timeline-empty">
        <Clock className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-sm">No timeline events yet</p>
        <p className="text-xs mt-1">Create Timeline or Event entities to see them here</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto" data-testid="timeline-view">
      {groupedByEra.map(([era, events]) => (
        <div key={era} className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1 bg-stone-700" />
            <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wider px-3 py-1 bg-stone-800/50 rounded-full border border-stone-700">
              {era}
            </h3>
            <div className="h-px flex-1 bg-stone-700" />
          </div>

          <div className="relative pl-8">
            <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-stone-700" />

            {events.map((event, idx) => {
              const cfg = ENTITY_TYPE_CONFIG[event.entity.entityType];
              return (
                <div key={event.entity.id} className="relative mb-4 last:mb-0">
                  <div
                    className="absolute left-[-22px] top-3 w-3 h-3 rounded-full border-2 border-stone-700"
                    style={{ backgroundColor: cfg?.color || "#666" }}
                  />

                  <button
                    onClick={() => onSelectEntity(event.entity.id)}
                    className="w-full text-left bg-stone-900/60 border border-stone-700 rounded-lg p-4 hover:border-stone-600 hover:bg-stone-800/60 transition-all group"
                    data-testid={`timeline-event-${event.entity.id}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {event.date && (
                            <Badge variant="outline" className="text-[10px] border-stone-600 text-stone-400">
                              <Calendar className="h-2.5 w-2.5 mr-1" />{event.date}
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className="text-[10px] border-stone-600"
                            style={{ color: cfg?.color, borderColor: cfg?.color + "55" }}
                          >
                            {cfg?.label || event.entity.entityType}
                          </Badge>
                        </div>
                        <h4 className="text-sm font-medium text-stone-200 group-hover:text-amber-400 transition-colors">
                          {event.entity.displayName}
                        </h4>
                        {event.entity.description && (
                          <p className="text-xs text-stone-400 mt-1 line-clamp-2">{event.entity.description}</p>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-stone-600 group-hover:text-stone-400 flex-shrink-0 mt-1" />
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
