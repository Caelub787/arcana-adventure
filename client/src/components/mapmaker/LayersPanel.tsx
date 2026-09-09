// The map's layers, and what is on each of them.
//
// Once a map has a few hundred trees, rocks, walls and labels on it, this is
// how anything gets found again. Layers can be hidden, locked, reordered,
// renamed and faded; the elements inside them can be selected from here rather
// than hunted for on the canvas.
//
// Three kinds of layer, and the difference matters: art is drawn into the map,
// VTT is the data a campaign reads to make the map playable, and GM is both
// hidden from players and left out of a player-facing export.
import { useMemo, useRef, useState } from "react";
import type { MapElement, MapLayer } from "@/lib/api";
import { Eye, EyeOff, GripVertical, Lock, Unlock, Plus, Trash2 } from "lucide-react";

const KIND_LABEL: Record<string, string> = {
  art: "Art",
  vtt: "Play data",
  gm: "GM only",
};

const KIND_HINT: Record<string, string> = {
  art: "Drawn into the map.",
  vtt: "Not drawn - this is what the campaign reads.",
  gm: "Hidden from players, and left out of a player-facing export.",
};

export function LayersPanel({
  layers,
  elements,
  selectedIds,
  activeLayerId,
  onSelectLayer,
  onSelectElements,
  onToggleVisible,
  onToggleLocked,
  onSetOpacity,
  onRename,
  onReorder,
  onAddLayer,
  onDeleteLayer,
}: {
  layers: MapLayer[];
  elements: MapElement[];
  selectedIds: string[];
  activeLayerId: string | null;
  onSelectLayer: (id: string) => void;
  onSelectElements: (ids: string[], additive?: boolean) => void;
  onToggleVisible: (layer: MapLayer) => void;
  onToggleLocked: (layer: MapLayer) => void;
  onSetOpacity: (layer: MapLayer, opacity: number) => void;
  onRename: (layer: MapLayer, name: string) => void;
  onReorder: (layerId: string, beforeLayerId: string | null) => void;
  onAddLayer: () => void;
  onDeleteLayer: (layer: MapLayer) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const dragId = useRef<string | null>(null);

  const byLayer = useMemo(() => {
    const map = new Map<string, MapElement[]>();
    for (const el of elements) {
      const key = el.layerId ?? "__none";
      const list = map.get(key);
      if (list) list.push(el); else map.set(key, [el]);
    }
    // Top of the stack first inside a layer, matching what the eye sees.
    for (const list of Array.from(map.values())) list.sort((a, b) => b.zIndex - a.zIndex);
    return map;
  }, [elements]);

  // Top of the map at the top of the panel, which is the opposite of the order
  // the map is drawn in.
  const ordered = useMemo(
    () => [...layers].sort((a, b) => b.sortOrder - a.sortOrder),
    [layers],
  );

  const elementLabel = (el: MapElement) =>
    el.name || (el.kind === "text" ? String(el.data?.text || "Label") : el.kind.charAt(0).toUpperCase() + el.kind.slice(1));

  const selected = new Set(selectedIds);
  let lastKind: string | null = null;

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="map-layers-panel">
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-stone-800 shrink-0">
        <span className="text-xs font-medium text-stone-300 flex-1">Layers</span>
        <button
          onClick={onAddLayer}
          className="p-1 rounded text-stone-400 hover:text-amber-400 hover:bg-stone-800"
          title="New layer"
          data-testid="button-add-map-layer"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-1 space-y-0.5">
        {ordered.map((layer) => {
          const contents = byLayer.get(layer.id) ?? [];
          const open = expanded[layer.id] ?? false;
          const heading = layer.kind !== lastKind ? layer.kind : null;
          lastKind = layer.kind;
          return (
            <div key={layer.id}>
              {heading && (
                <p
                  className="text-[10px] uppercase tracking-wide text-stone-600 px-1.5 pt-2 pb-0.5"
                  title={KIND_HINT[heading]}
                >
                  {KIND_LABEL[heading] ?? heading}
                </p>
              )}
              <div
                draggable
                onDragStart={() => { dragId.current = layer.id; }}
                onDragOver={(e) => { if (dragId.current && dragId.current !== layer.id) e.preventDefault(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = dragId.current;
                  dragId.current = null;
                  if (from && from !== layer.id) onReorder(from, layer.id);
                }}
                onClick={() => onSelectLayer(layer.id)}
                className={`group flex items-center gap-1 px-1.5 py-1 rounded text-xs cursor-pointer border ${
                  activeLayerId === layer.id
                    ? "bg-amber-900/25 border-amber-700/40 text-amber-300"
                    : "border-transparent text-stone-300 hover:bg-stone-800/60"
                }`}
                data-testid={`map-layer-${layer.id}`}
              >
                <GripVertical className="h-3 w-3 text-stone-600 shrink-0" />
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleVisible(layer); }}
                  className="p-0.5 text-stone-400 hover:text-stone-100 shrink-0"
                  title={layer.visible ? "Hide this layer" : "Show this layer"}
                  data-testid={`button-layer-visible-${layer.id}`}
                >
                  {layer.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3 text-stone-600" />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleLocked(layer); }}
                  className="p-0.5 text-stone-400 hover:text-stone-100 shrink-0"
                  title={layer.locked ? "Unlock this layer" : "Lock this layer"}
                  data-testid={`button-layer-locked-${layer.id}`}
                >
                  {layer.locked ? <Lock className="h-3 w-3 text-amber-500" /> : <Unlock className="h-3 w-3" />}
                </button>

                {renaming === layer.id ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={() => { onRename(layer, draft.trim() || layer.name); setRenaming(null); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { onRename(layer, draft.trim() || layer.name); setRenaming(null); }
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    className="flex-1 min-w-0 bg-stone-900 border border-stone-700 rounded px-1 text-xs"
                    data-testid={`input-layer-name-${layer.id}`}
                  />
                ) : (
                  <span
                    className="flex-1 truncate"
                    onDoubleClick={(e) => { e.stopPropagation(); setDraft(layer.name); setRenaming(layer.id); }}
                    title="Double-click to rename"
                  >
                    {layer.name}
                  </span>
                )}

                {contents.length > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setExpanded((p) => ({ ...p, [layer.id]: !open })); }}
                    className="text-[10px] text-stone-500 hover:text-stone-300 shrink-0 tabular-nums px-1"
                    title={open ? "Hide what is on this layer" : "Show what is on this layer"}
                    data-testid={`button-layer-expand-${layer.id}`}
                  >
                    {contents.length}
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteLayer(layer); }}
                  className="p-0.5 text-stone-600 hover:text-red-400 shrink-0 opacity-0 group-hover:opacity-100"
                  title="Delete this layer and everything on it"
                  data-testid={`button-layer-delete-${layer.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>

              {activeLayerId === layer.id && (
                <div className="flex items-center gap-1.5 px-2 py-1" onClick={(e) => e.stopPropagation()}>
                  <span className="text-[10px] text-stone-500 shrink-0">Opacity</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round((layer.opacity ?? 1) * 100)}
                    onChange={(e) => onSetOpacity(layer, Number(e.target.value) / 100)}
                    className="flex-1 accent-amber-500"
                    data-testid={`input-layer-opacity-${layer.id}`}
                  />
                  <span className="text-[10px] text-stone-500 tabular-nums w-7 text-right">
                    {Math.round((layer.opacity ?? 1) * 100)}
                  </span>
                </div>
              )}

              {open && contents.length > 0 && (
                <div className="ml-5 space-y-0.5">
                  {contents.map((el) => (
                    <div
                      key={el.id}
                      onClick={(e) => onSelectElements([el.id], e.shiftKey)}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] cursor-pointer ${
                        selected.has(el.id)
                          ? "bg-amber-900/30 text-amber-300"
                          : "text-stone-400 hover:bg-stone-800/60"
                      }`}
                      data-testid={`map-element-row-${el.id}`}
                    >
                      <span className="flex-1 truncate">{elementLabel(el)}</span>
                      {el.locked && <Lock className="h-2.5 w-2.5 text-amber-600 shrink-0" />}
                      {el.hidden && <EyeOff className="h-2.5 w-2.5 text-stone-600 shrink-0" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
