import { useState } from 'react';
import { WorldMapViewer } from '@/components/worldbuilding/WorldMapViewer';
import { WorldMapEditor } from '@/components/worldbuilding/WorldMapEditor';
import { TimelineView } from '@/components/worldbuilding/TimelineView';
import { WorldCalendar } from '@/components/worldbuilding/WorldCalendar';
import { WorldbuilderPanel } from '@/components/worldbuilding/WorldbuilderPanel';

export type SectionPanelId = 'encyclopedia' | 'maps' | 'timeline' | 'calendar';

interface SectionPanelProps {
  worldId: string;
  isGM: boolean;
  onOpenArticle?: (entityId: string) => void;
}

/** Maps browser that flips to the full map editor in-place (no tab needed). */
export function MapsPanel({ worldId, isGM, onOpenArticle }: SectionPanelProps) {
  const [editingMapId, setEditingMapId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (creating || editingMapId !== null) {
    return (
      <div className="h-full min-h-0 overflow-hidden">
        <WorldMapEditor
          worldId={worldId}
          mapId={editingMapId ?? undefined}
          onBack={() => { setEditingMapId(null); setCreating(false); }}
          onMapCreated={() => { setCreating(false); }}
        />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <WorldMapViewer
        worldId={worldId}
        isGM={isGM}
        onEditMap={(mapId) => setEditingMapId(mapId)}
        onCreateMap={() => setCreating(true)}
        onNavigateToEntity={onOpenArticle}
      />
    </div>
  );
}

export function TimelinePanel({ worldId, isGM, onOpenArticle }: SectionPanelProps) {
  const [selectedTimelineId, setSelectedTimelineId] = useState<string | null>(null);
  return (
    <div className="h-full min-h-0 overflow-hidden">
      <TimelineView
        worldId={worldId}
        isGM={isGM}
        onSelectEntity={onOpenArticle}
        selectedTimelineId={selectedTimelineId}
        onSelectTimeline={setSelectedTimelineId}
      />
    </div>
  );
}

export function CalendarPanel({ worldId, isGM }: SectionPanelProps) {
  return (
    <div className="h-full min-h-0 overflow-hidden">
      <WorldCalendar worldId={worldId} isGM={isGM} />
    </div>
  );
}

export function EncyclopediaPanel({ worldId, isGM, onOpenArticle }: SectionPanelProps) {
  return (
    <div className="h-full min-h-0 overflow-hidden">
      <WorldbuilderPanel
        worldId={worldId}
        isGM={isGM}
        characters={[]}
        onOpenEntity={(id) => onOpenArticle?.(id)}
        onOpenEntityNewTab={(id) => onOpenArticle?.(id)}
      />
    </div>
  );
}

export function renderSectionPanel(
  id: SectionPanelId,
  props: SectionPanelProps,
): React.ReactNode {
  switch (id) {
    case 'maps':
      return <MapsPanel {...props} />;
    case 'timeline':
      return <TimelinePanel {...props} />;
    case 'calendar':
      return <CalendarPanel {...props} />;
    case 'encyclopedia':
      return <EncyclopediaPanel {...props} />;
    default:
      return null;
  }
}
