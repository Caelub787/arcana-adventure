// GM editor for a scene's stacked levels (floors, basements, rooftops), plus
// the small elevation stepper shown on a held token. Always a floating panel.
import React, { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Eye, ImagePlus, Folder, Layers, Trash2, X, Crosshair } from "lucide-react";
import { FloatingPanel } from "@/components/ui/floating-panel";
import { ImageBrowser } from "@/components/ImageBrowser";
import { BASE_LEVEL_ID, newLevelId, type SceneLevel } from "@shared/battlemapLevels";

interface LevelsPanelProps {
  levels: SceneLevel[];
  viewLevelId: string;
  followSelection: boolean;
  tokenCounts: Record<string, number>;
  feetPerCell: number;
  onViewLevel: (levelId: string) => void;
  onFollowSelection: (on: boolean) => void;
  onSave: (levels: SceneLevel[]) => void;
  onClose: () => void;
}

async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("image", file);
  const res = await fetch("/api/upload/image", { method: "POST", credentials: "include", body: formData });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Upload failed");
  return (await res.json()).url;
}

export function LevelsPanel({ levels, viewLevelId, followSelection, tokenCounts, feetPerCell, onViewLevel, onFollowSelection, onSave, onClose }: LevelsPanelProps) {
  // Local copy so typing in a name/elevation box doesn't round-trip the server per key.
  const [draft, setDraft] = useState<SceneLevel[]>(levels);
  const dirty = useRef(false);
  useEffect(() => { if (!dirty.current) setDraft(levels); }, [levels]);
  const [browseFor, setBrowseFor] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  const commit = (next: SceneLevel[]) => { dirty.current = false; setDraft(next); onSave(next); };
  const edit = (id: string, patch: Partial<SceneLevel>) => { dirty.current = true; setDraft((d) => d.map((l) => (l.id === id ? { ...l, ...patch } : l))); };
  const set = (id: string, patch: Partial<SceneLevel>) => commit(draft.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const step = Math.max(1, feetPerCell * 2);
  const top = draft.reduce((m, l) => Math.max(m, l.elevation), 0);
  const bottom = draft.reduce((m, l) => Math.min(m, l.elevation), 0);
  const add = (where: "above" | "below") => {
    const lvl: SceneLevel = where === "above"
      ? { id: newLevelId(), name: draft.length === 1 ? "Upper Floor" : `Floor ${draft.filter((l) => l.elevation > 0).length + 2}`, elevation: top + step, image: null, solidFloor: false }
      : { id: newLevelId(), name: bottom === 0 ? "Basement" : `Sub-level ${draft.filter((l) => l.elevation < 0).length + 1}`, elevation: bottom - step, image: null, solidFloor: false };
    commit([...draft, lvl]);
  };
  const ordered = [...draft].sort((a, b) => b.elevation - a.elevation);

  return (
    <FloatingPanel
      open
      onClose={onClose}
      panelKey="battlemap-levels"
      title={<span className="flex items-center gap-2"><Layers className="h-4 w-4 text-amber-400" /> Levels</span>}
      defaultSize={{ width: 440, height: 560 }}
      minWidth={340}
      minHeight={300}
    >
      <div className="p-3 space-y-3 text-stone-200 text-sm" data-testid="battlemap-levels-panel">
        <p className="text-xs text-stone-400 leading-relaxed">
          Stack floors on this scene. A token's <b>elevation</b> decides which level it stands on; each player sees the level
          their token is on — its map, walls, lights and the tokens there. Walls, doors, lights and pins you draw go on the level you're viewing.
        </p>
        <label className="flex items-center justify-between gap-2 rounded-md border border-stone-700 bg-stone-900/60 px-2.5 py-2 text-xs">
          <span className="flex items-center gap-1.5"><Crosshair className="h-3.5 w-3.5 text-cyan-400" /> Follow the selected token's level</span>
          <input type="checkbox" checked={followSelection} onChange={(e) => onFollowSelection(e.target.checked)} data-testid="levels-follow-selection" />
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={() => add("above")} className="flex-1 h-8 rounded border border-amber-600/60 bg-amber-600/15 text-amber-200 text-xs hover:bg-amber-600/25 flex items-center justify-center gap-1" data-testid="levels-add-above"><ArrowUp className="h-3.5 w-3.5" /> Add floor above</button>
          <button type="button" onClick={() => add("below")} className="flex-1 h-8 rounded border border-stone-600 bg-stone-800 text-stone-200 text-xs hover:bg-stone-700 flex items-center justify-center gap-1" data-testid="levels-add-below"><ArrowDown className="h-3.5 w-3.5" /> Add level below</button>
        </div>
        <div className="space-y-2">
          {ordered.map((l) => {
            const isBase = l.id === BASE_LEVEL_ID;
            const viewing = l.id === viewLevelId;
            return (
              <div key={l.id} className={`rounded-lg border p-2.5 space-y-2 ${viewing ? "border-cyan-500/70 bg-cyan-950/20" : "border-stone-700 bg-stone-900/50"}`} data-testid={`level-row-${l.id}`}>
                <div className="flex items-center gap-2">
                  <input
                    value={l.name}
                    onChange={(e) => edit(l.id, { name: e.target.value })}
                    onBlur={() => commit(draft)}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    className="flex-1 min-w-0 h-7 rounded bg-stone-950 border border-stone-700 px-2 text-sm font-medium"
                    data-testid={`level-name-${l.id}`}
                  />
                  <div className="flex items-center gap-1 shrink-0" title={isBase ? "The ground is always at 0 ft" : "Floor height in feet"}>
                    <input
                      type="number"
                      value={l.elevation}
                      disabled={isBase}
                      onChange={(e) => edit(l.id, { elevation: Number(e.target.value) || 0 })}
                      onBlur={() => commit(draft)}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      className="w-16 h-7 rounded bg-stone-950 border border-stone-700 px-1.5 text-right text-xs disabled:opacity-60"
                      data-testid={`level-elevation-${l.id}`}
                    />
                    <span className="text-[11px] text-stone-500">ft</span>
                  </div>
                  <button type="button" onClick={() => onViewLevel(l.id)} className={`h-7 w-7 grid place-items-center rounded border ${viewing ? "border-cyan-400 text-cyan-300 bg-cyan-500/15" : "border-stone-600 text-stone-300 hover:bg-stone-800"}`} title="View this level" data-testid={`level-view-${l.id}`}><Eye className="h-3.5 w-3.5" /></button>
                  {!isBase && (
                    <button type="button" onClick={() => { if (window.confirm(`Delete "${l.name}"? Tokens there stay at their elevation; walls and lights drawn on it stay saved but won't show.`)) commit(draft.filter((x) => x.id !== l.id)); }} className="h-7 w-7 grid place-items-center rounded border border-stone-600 text-stone-400 hover:text-red-300 hover:border-red-500/60" title="Delete level" data-testid={`level-delete-${l.id}`}><Trash2 className="h-3.5 w-3.5" /></button>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {isBase ? (
                    <span className="text-stone-400 flex-1">Map: the scene's background image</span>
                  ) : (
                    <>
                      {l.image ? <img src={l.image} alt="" className="h-9 w-14 object-cover rounded border border-stone-700" /> : <span className="h-9 w-14 rounded border border-dashed border-stone-700 grid place-items-center text-[10px] text-stone-500">no map</span>}
                      <label className="h-7 px-2 rounded border border-stone-600 hover:bg-stone-800 flex items-center gap-1 cursor-pointer" data-testid={`level-upload-${l.id}`}>
                        <ImagePlus className="h-3.5 w-3.5" /> {uploading === l.id ? "Uploading…" : "Upload"}
                        <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                          const f = e.target.files?.[0]; e.target.value = "";
                          if (!f) return;
                          setUploading(l.id);
                          try { set(l.id, { image: await uploadImage(f) }); } catch (err: any) { window.alert(err?.message || "Upload failed"); } finally { setUploading(null); }
                        }} />
                      </label>
                      <button type="button" onClick={() => setBrowseFor(l.id)} className="h-7 px-2 rounded border border-stone-600 hover:bg-stone-800 flex items-center gap-1"><Folder className="h-3.5 w-3.5" /> Library</button>
                      {l.image && <button type="button" onClick={() => set(l.id, { image: null })} className="h-7 w-7 grid place-items-center rounded border border-stone-600 hover:bg-stone-800" title="Remove map image"><X className="h-3.5 w-3.5" /></button>}
                    </>
                  )}
                </div>
                <div className="flex items-center justify-between text-[11px] text-stone-400">
                  <label className="flex items-center gap-1.5 cursor-pointer" title="While you're on this level, nothing beneath it shows through">
                    <input type="checkbox" checked={!!l.solidFloor} onChange={(e) => set(l.id, { solidFloor: e.target.checked })} data-testid={`level-solid-${l.id}`} />
                    Solid floor (hide levels below)
                  </label>
                  <span>{tokenCounts[l.id] ?? 0} token{(tokenCounts[l.id] ?? 0) === 1 ? "" : "s"}</span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-stone-500 leading-relaxed">
          Tip: upper floors usually use a transparent PNG so the ground below shows around the building.
          Raise or lower a token from its hold menu (the ▲▼ buttons) or with your elevation keybinds.
        </p>
      </div>
      <ImageBrowser
        open={!!browseFor}
        onOpenChange={(o) => { if (!o) setBrowseFor(null); }}
        onSelect={(url) => { if (browseFor) set(browseFor, { image: url }); setBrowseFor(null); }}
        saveToFile
        floating
        title="Level map image"
      />
    </FloatingPanel>
  );
}

/** ▲ 10 ft ▼ — shown above a held token for anyone who controls it. */
export function ElevationStepper({ elevation, step, onChange, testId }: { elevation: number; step: number; onChange: (e: number) => void; testId?: string }) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 -top-11 z-30 flex items-center gap-0.5 rounded-full bg-stone-900/95 border border-sky-500/70 shadow-lg px-1 py-0.5 pointer-events-auto touch-auto"
      onPointerDown={stop} onMouseDown={stop} onClick={stop} onDoubleClick={stop}
      data-testid={testId}
    >
      <button type="button" className="h-6 w-6 grid place-items-center rounded-full hover:bg-sky-600/40 text-sky-200" title={`Lower ${step} ft`} onClick={(e) => { e.stopPropagation(); onChange(elevation - step); }} data-testid={testId ? `${testId}-down` : undefined}><ArrowDown className="h-3.5 w-3.5" /></button>
      <span className="min-w-[44px] text-center text-[11px] font-semibold text-sky-100 tabular-nums">{elevation > 0 ? "+" : ""}{elevation} ft</span>
      <button type="button" className="h-6 w-6 grid place-items-center rounded-full hover:bg-sky-600/40 text-sky-200" title={`Raise ${step} ft`} onClick={(e) => { e.stopPropagation(); onChange(elevation + step); }} data-testid={testId ? `${testId}-up` : undefined}><ArrowUp className="h-3.5 w-3.5" /></button>
    </div>
  );
}

