import React from "react";
import { Badge } from "@/components/ui/badge";
import { ENTITY_TYPE_CONFIG, LINK_TYPE_LABELS, type Entity, type EntityLink } from "@/lib/worldbuilding-api";
import { User, MapPin, Shield, Scroll, Calendar, BookOpen, Package, Swords, Search, Link2, ArrowRight } from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  User, MapPin, Shield, Scroll, Calendar, BookOpen, Package, Swords, Search,
};

interface EntityPreviewPanelProps {
  entity: Entity;
  onClick?: () => void;
  compact?: boolean;
}

export function EntityPreviewPanel({ entity, onClick, compact = false }: EntityPreviewPanelProps) {
  const cfg = ENTITY_TYPE_CONFIG[entity.entityType];
  const IconComp = cfg ? ICON_MAP[cfg.icon] || Search : Search;

  return (
    <div
      className={`bg-stone-900 border border-stone-700 rounded-lg shadow-xl overflow-hidden ${onClick ? "cursor-pointer hover:border-stone-600" : ""} transition-colors`}
      onClick={onClick}
      data-testid={`entity-preview-${entity.id}`}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-800" style={{ borderLeftColor: cfg?.color, borderLeftWidth: 3 }}>
        <IconComp className="h-4 w-4 flex-shrink-0" style={{ color: cfg?.color }} />
        <span className="font-medium text-stone-200 text-sm truncate flex-1">{entity.displayName}</span>
        <Badge variant="outline" className="text-[10px] px-1.5 border-stone-600 text-stone-400">{cfg?.label || entity.entityType}</Badge>
      </div>

      {!compact && (
        <div className="p-3 space-y-2">
          {entity.description && (
            <p className="text-xs text-stone-400 line-clamp-2">{entity.description}</p>
          )}
          {entity.tags && entity.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {entity.tags.map(tag => (
                <Badge key={tag} variant="outline" className="text-[10px] px-1.5 border-stone-700 text-stone-500">{tag}</Badge>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 text-[10px] text-stone-500">
            {entity.sheetId && <span className="flex items-center gap-1"><User className="h-3 w-3" /> Has Sheet</span>}
            {entity.notePageId && <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" /> Has Notes</span>}
            <span>{entity.visibility === "gm_only" ? "GM Only" : entity.visibility === "player_visible" ? "Player Visible" : "Shared"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

interface EntityLinkCardProps {
  link: EntityLink;
  fromEntity?: Entity;
  toEntity?: Entity;
  onClickEntity?: (entityId: string) => void;
  onRemove?: () => void;
}

export function EntityLinkCard({ link, fromEntity, toEntity, onClickEntity, onRemove }: EntityLinkCardProps) {
  const linkLabel = LINK_TYPE_LABELS[link.linkType] || link.linkType;
  const fromCfg = fromEntity ? ENTITY_TYPE_CONFIG[fromEntity.entityType] : null;
  const toCfg = toEntity ? ENTITY_TYPE_CONFIG[toEntity.entityType] : null;

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 bg-stone-800/50 rounded border border-stone-700/50 text-xs group" data-testid={`entity-link-${link.id}`}>
      {fromEntity && (
        <button
          onClick={() => onClickEntity?.(fromEntity.id)}
          className="text-stone-300 hover:text-amber-400 truncate max-w-[100px] transition-colors"
          style={{ color: fromCfg?.color }}
        >
          {fromEntity.displayName}
        </button>
      )}
      <div className="flex items-center gap-1 text-stone-500 flex-shrink-0">
        <ArrowRight className="h-3 w-3" />
        <span className="text-[10px] italic">{link.label || linkLabel}</span>
      </div>
      {toEntity && (
        <button
          onClick={() => onClickEntity?.(toEntity.id)}
          className="text-stone-300 hover:text-amber-400 truncate max-w-[100px] transition-colors"
          style={{ color: toCfg?.color }}
        >
          {toEntity.displayName}
        </button>
      )}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-auto opacity-0 group-hover:opacity-100 text-stone-500 hover:text-red-400 transition-all"
          data-testid={`button-remove-link-${link.id}`}
        >
          ×
        </button>
      )}
    </div>
  );
}
