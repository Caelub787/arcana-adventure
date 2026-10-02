// Soundscape: the floating tab at the top-centre of the table.
// GMs get the full mixer (library, layers, scenes); players get their own
// volume controls for whatever the GM is playing.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown, ChevronUp, Music, Play, Plus, Repeat, Save, Search, Square, Trash2, Volume2, VolumeX, X, Zap,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { api, gameWs } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  applyRemoteSoundscape, makeLayer, soundscape, toggleLayer, triggerSound, updateSoundscape,
} from "@/lib/soundscape";
import {
  BUILT_IN_SCENES, EMPTY_SOUNDSCAPE, SOUNDSCAPE_LIBRARY, getSound,
  type SoundKind, type SoundscapeScene, type SoundscapeSceneLayer,
} from "@shared/soundscape";

const KIND_TABS: { kind: SoundKind; label: string }[] = [
  { kind: "music", label: "Music" },
  { kind: "ambience", label: "Ambience" },
  { kind: "sfx", label: "Effects" },
];

function useSoundscapeVersion() {
  // The engine is a mutable singleton; re-render on any change it reports.
  const versionRef = useRef(0);
  return useSyncExternalStore(
    (fn) => soundscape.subscribe(() => { versionRef.current++; fn(); }),
    () => versionRef.current,
  );
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m ? `${m}:${String(r).padStart(2, "0")}` : `${s.toFixed(s < 10 ? 1 : 0)}s`;
}

function VolumeRow({ value, onChange, label, muted }: { value: number; onChange: (v: number) => void; label?: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      {label && <span className="text-[11px] uppercase tracking-wide text-stone-400 w-14 shrink-0">{label}</span>}
      <Slider
        className={`flex-1 min-w-[80px] ${muted ? "opacity-40" : ""}`}
        value={[Math.round(value * 100)]}
        min={0}
        max={100}
        step={1}
        onValueChange={([v]) => onChange(v / 100)}
      />
      <span className="text-[11px] tabular-nums text-stone-400 w-8 text-right">{Math.round(value * 100)}</span>
    </div>
  );
}

interface Props {
  campaignId: string;
  isGM: boolean;
  /** Spectator/cast views still hear the mix but show no controls. */
  hideControls?: boolean;
}

export function SoundscapePanel({ campaignId, isGM, hideControls }: Props) {
  useSoundscapeVersion();
  const [open, setOpen] = useState(false);

  // Live mix: initial state over REST, then websocket updates.
  useEffect(() => {
    let cancelled = false;
    api.getSoundscapeState(campaignId)
      .then((state) => { if (!cancelled) applyRemoteSoundscape(state); })
      .catch(() => {});
    const off = gameWs.onMessage((msg: any) => {
      if (msg?.campaignId && msg.campaignId !== campaignId) return;
      if (msg?.type === "soundscape_state") applyRemoteSoundscape(msg.state);
      else if (msg?.type === "soundscape_sfx" && typeof msg.soundId === "string") soundscape.playOneShot(msg.soundId, Number(msg.volume) || 1);
    });
    // Browsers keep audio blocked until the user interacts with the page.
    const unlock = () => soundscape.unlock();
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    return () => {
      cancelled = true;
      off();
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      soundscape.preview(null);
      // Leaving the table silences it.
      soundscape.apply({ ...EMPTY_SOUNDSCAPE, layers: [] });
    };
  }, [campaignId]);

  // GM: non-looping layers (a stinger dropped into the mix) clear themselves once they finish.
  const endedKey = Array.from(soundscape.ended).join(",");
  useEffect(() => {
    if (!isGM || !endedKey) return;
    const ended = new Set(endedKey.split(","));
    if (!soundscape.state.layers.some((l) => ended.has(l.instanceId) && !l.loop)) return;
    updateSoundscape((s) => ({ ...s, layers: s.layers.filter((l) => l.loop || !ended.has(l.instanceId)) }));
  }, [isGM, endedKey]);

  if (hideControls) return null;

  const layers = soundscape.state.layers;
  const playingCount = layers.length;
  // Players only see the tab once there's something to hear.
  if (!isGM && playingCount === 0) return null;

  const { prefs, locked } = soundscape;
  return (
    <div
      className="fixed top-3 left-1/2 -translate-x-1/2 z-40 pointer-events-auto flex flex-col items-center"
      data-testid="soundscape-panel"
    >
      <button
        type="button"
        onClick={() => { soundscape.unlock(); setOpen((o) => !o); }}
        className={`chrome-frame chrome-btn flex items-center gap-2 h-9 px-3 rounded-md border backdrop-blur-sm shadow-lg text-sm transition-colors ${
          open ? "bg-stone-900/90 border-amber-500 text-amber-300" : "bg-stone-900/70 hover:bg-stone-800/90 border-stone-600/60 hover:border-amber-500/60 text-white/85"
        }`}
        data-testid="button-soundscape-tab"
      >
        <Music className="h-4 w-4" />
        <span className="font-medium tracking-wide">Soundscape</span>
        {playingCount > 0 && (
          <span className="flex items-end gap-[2px] h-3" aria-label={`${playingCount} playing`}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-[3px] bg-amber-400 rounded-sm"
                style={{ height: "100%", animation: locked || prefs.muted ? undefined : `soundscape-eq 0.9s ${i * 0.15}s ease-in-out infinite alternate`, transform: locked || prefs.muted ? "scaleY(0.3)" : undefined, transformOrigin: "bottom" }}
              />
            ))}
          </span>
        )}
        {prefs.muted && <VolumeX className="h-4 w-4 text-red-400" />}
        {open ? <ChevronUp className="h-3.5 w-3.5 opacity-70" /> : <ChevronDown className="h-3.5 w-3.5 opacity-70" />}
      </button>
      <style>{`@keyframes soundscape-eq { from { transform: scaleY(0.25) } to { transform: scaleY(1) } }`}</style>

      {locked && playingCount > 0 && !open && (
        <button
          type="button"
          onClick={() => soundscape.unlock()}
          className="mt-1 text-xs px-2 py-1 rounded bg-amber-600/90 text-white shadow animate-pulse"
        >
          Click to enable sound
        </button>
      )}

      {open && (isGM
        ? <GMMixer campaignId={campaignId} onClose={() => setOpen(false)} />
        : <PlayerControls onClose={() => setOpen(false)} />)}
    </div>
  );
}

function PersonalLevels() {
  const { prefs } = soundscape;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => soundscape.setPrefs({ muted: !prefs.muted })}
          className={`p-1 rounded hover:bg-stone-700/60 ${prefs.muted ? "text-red-400" : "text-stone-300"}`}
          title={prefs.muted ? "Unmute" : "Mute for me"}
          data-testid="button-soundscape-mute"
        >
          {prefs.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <span className="text-xs text-stone-400">Your speakers only</span>
      </div>
      <VolumeRow label="Music" value={prefs.music} muted={prefs.muted} onChange={(music) => soundscape.setPrefs({ music })} />
      <VolumeRow label="Effects" value={prefs.sfx} muted={prefs.muted} onChange={(sfx) => soundscape.setPrefs({ sfx })} />
    </div>
  );
}

const panelClass = "mt-2 rounded-lg border border-stone-600/70 bg-stone-950/95 backdrop-blur-md shadow-2xl text-stone-200";

function PlayerControls({ onClose }: { onClose: () => void }) {
  const layers = soundscape.state.layers;
  return (
    <div className={`${panelClass} w-[300px] max-w-[calc(100vw-32px)] p-3 space-y-3`}>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-amber-400/90">Now playing</span>
        <button type="button" onClick={onClose} className="text-stone-500 hover:text-stone-200"><X className="h-4 w-4" /></button>
      </div>
      <ul className="space-y-1">
        {layers.map((l) => (
          <li key={l.instanceId} className="flex items-center gap-2 text-sm">
            <Music className="h-3.5 w-3.5 text-amber-400/80 shrink-0" />
            <span className="truncate">{getSound(l.soundId)?.name ?? l.soundId}</span>
          </li>
        ))}
      </ul>
      <PersonalLevels />
    </div>
  );
}

type SavedScene = SoundscapeScene & { builtIn?: false };

function GMMixer({ campaignId, onClose }: { campaignId: string; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<SoundKind>("music");
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [savingName, setSavingName] = useState<string | null>(null);

  const scenesKey = ["soundscape-scenes", campaignId];
  const { data: savedScenes = [] } = useQuery<SavedScene[]>({
    queryKey: scenesKey,
    queryFn: () => api.getSoundscapeScenes(campaignId) as Promise<SavedScene[]>,
  });
  const saveScene = useMutation({
    mutationFn: (data: { name: string; layers: SoundscapeSceneLayer[] }) => api.createSoundscapeScene(campaignId, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: scenesKey }); setSavingName(null); },
    onError: (e: any) => toast({ title: "Couldn't save scene", description: e?.message, variant: "destructive" }),
  });
  const deleteScene = useMutation({
    mutationFn: (id: string) => api.deleteSoundscapeScene(campaignId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scenesKey }),
  });

  const searching = query.trim().length > 0;
  const categories = useMemo(
    () => Array.from(new Set(SOUNDSCAPE_LIBRARY.filter((s) => s.kind === kind).map((s) => s.category))),
    [kind],
  );
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SOUNDSCAPE_LIBRARY.filter((s) => {
      if (q) return s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q) || s.tags.some((t) => t.includes(q));
      return s.kind === kind && (!category || s.category === category);
    });
  }, [query, kind, category]);

  const layers = soundscape.state.layers;
  const inMix = new Set(layers.map((l) => l.soundId));

  const loadScene = (scene: SoundscapeScene) => {
    soundscape.unlock();
    updateSoundscape((s) => ({ ...s, layers: scene.layers.map((l) => makeLayer(l.soundId, l.volume, l.loop)) }));
  };
  const setLayer = (instanceId: string, patch: { volume?: number; loop?: boolean }) =>
    updateSoundscape((s) => ({ ...s, layers: s.layers.map((l) => (l.instanceId === instanceId ? { ...l, ...patch } : l)) }));


  return (
    <div className={`${panelClass} w-[760px] max-w-[calc(100vw-32px)] max-h-[min(72vh,620px)] flex flex-col sm:flex-row overflow-hidden`} data-testid="soundscape-mixer">
      {/* Library */}
      <div className="flex-1 min-w-0 flex flex-col border-b sm:border-b-0 sm:border-r border-stone-700/70 min-h-0">
        <div className="p-2.5 space-y-2 border-b border-stone-800">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-stone-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sounds — sword, rain, dragon…"
              className="w-full h-8 pl-7 pr-2 rounded bg-stone-900 border border-stone-700 focus:border-amber-500/70 outline-none text-sm placeholder:text-stone-500"
              data-testid="input-soundscape-search"
            />
          </div>
          {!searching && (
            <>
              <div className="flex gap-1">
                {KIND_TABS.map((t) => (
                  <button
                    key={t.kind}
                    type="button"
                    onClick={() => { setKind(t.kind); setCategory(null); }}
                    className={`flex-1 h-7 rounded text-xs font-medium tracking-wide ${kind === t.kind ? "bg-amber-600/90 text-white" : "bg-stone-800/80 text-stone-300 hover:bg-stone-700"}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {categories.length > 1 && (
                <div className="flex flex-wrap gap-1">
                  {categories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(category === c ? null : c)}
                      className={`px-2 h-6 rounded-full text-[11px] border ${category === c ? "border-amber-500 text-amber-300 bg-amber-500/10" : "border-stone-700 text-stone-400 hover:text-stone-200"}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <ul className="flex-1 overflow-y-auto p-1.5 space-y-0.5 min-h-[160px]">
          {results.map((s) => {
            const previewing = soundscape.previewing === s.id;
            return (
              <li key={s.id} className="group flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-stone-800/70">
                <button
                  type="button"
                  onClick={() => soundscape.preview(previewing ? null : s.id)}
                  className={`h-6 w-6 shrink-0 grid place-items-center rounded ${previewing ? "bg-amber-500 text-stone-950" : "bg-stone-800 text-stone-300 hover:text-amber-300"}`}
                  title={previewing ? "Stop preview" : "Preview (only you hear it)"}
                >
                  {previewing ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{s.name}</div>
                  <div className="text-[10px] text-stone-500 truncate">
                    {searching ? `${s.category} · ` : ""}{s.loop ? `Loop · ${fmtTime(s.duration)}` : fmtTime(s.duration)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => triggerSound(s.id, { isGM: true, volume: 1 }) /* loops toggle into the mix */}
                  className={`${s.loop && s.kind !== "sfx" ? "hidden" : ""} h-6 px-2 shrink-0 rounded text-[11px] bg-stone-800 hover:bg-amber-600 hover:text-white text-stone-300 flex items-center gap-1`}
                  title="Play once for everyone"
                  data-testid={`button-soundscape-play-${s.id}`}
                >
                  <Zap className="h-3 w-3" /> Play
                </button>
                <button
                  type="button"
                  onClick={() => { soundscape.unlock(); if (inMix.has(s.id) && s.loop) toggleLayer(s.id); else updateSoundscape((st) => ({ ...st, layers: [...st.layers, makeLayer(s.id)] })); }}
                  className={`h-6 px-2 shrink-0 rounded text-[11px] flex items-center gap-1 ${inMix.has(s.id) && s.loop ? "bg-amber-600 text-white" : "bg-stone-800 hover:bg-stone-700 text-stone-300"}`}
                  title={inMix.has(s.id) && s.loop ? "Remove from the mix" : "Add to the mix"}
                  data-testid={`button-soundscape-add-${s.id}`}
                >
                  {inMix.has(s.id) && s.loop ? <><Square className="h-3 w-3" /> Stop</> : <><Plus className="h-3 w-3" /> Mix</>}
                </button>
              </li>
            );
          })}
          {results.length === 0 && <li className="text-xs text-stone-500 p-3 text-center">No sounds match “{query}”.</li>}
        </ul>
      </div>

      {/* Mixer + scenes */}
      <div className="sm:w-[300px] shrink-0 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
          <span className="text-xs uppercase tracking-wider text-amber-400/90">Now playing</span>
          <div className="flex items-center gap-1">
            {layers.length > 0 && (
              <button
                type="button"
                onClick={() => updateSoundscape((s) => ({ ...s, layers: [] }))}
                className="h-6 px-2 rounded text-[11px] bg-stone-800 hover:bg-red-700 text-stone-300 hover:text-white flex items-center gap-1"
                data-testid="button-soundscape-stop-all"
              >
                <Square className="h-3 w-3" /> Stop all
              </button>
            )}
            <button type="button" onClick={onClose} className="text-stone-500 hover:text-stone-200 p-1"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="px-3 pb-2">
          <VolumeRow label="Table" value={soundscape.state.masterVolume} onChange={(masterVolume) => updateSoundscape((s) => ({ ...s, masterVolume }))} />
        </div>
        <ul className="px-2 space-y-1 overflow-y-auto max-h-[240px]">
          {layers.length === 0 && <li className="text-xs text-stone-500 px-1 py-2">Nothing playing. Add sounds from the library or load a scene.</li>}
          {layers.map((l) => {
            const def = getSound(l.soundId);
            const loading = soundscape.isLoading(l.instanceId);
            return (
              <li key={l.instanceId} className="rounded bg-stone-900/80 border border-stone-800 px-2 py-1.5" data-testid={`soundscape-layer-${l.soundId}`}>
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${loading ? "bg-stone-500 animate-pulse" : "bg-amber-400"}`} />
                  <span className="text-sm truncate flex-1">{def?.name ?? l.soundId}</span>
                  <button
                    type="button"
                    onClick={() => setLayer(l.instanceId, { loop: !l.loop })}
                    className={`p-1 rounded ${l.loop ? "text-amber-300 bg-amber-500/15" : "text-stone-500 hover:text-stone-200"}`}
                    title={l.loop ? "Looping — click to play out once" : "Plays once — click to loop"}
                  >
                    <Repeat className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSoundscape((s) => ({ ...s, layers: s.layers.filter((x) => x.instanceId !== l.instanceId) }))}
                    className="p-1 rounded text-stone-500 hover:text-red-400"
                    title="Fade out"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <VolumeRow value={l.volume} onChange={(volume) => setLayer(l.instanceId, { volume })} />
              </li>
            );
          })}
        </ul>

        <div className="px-3 pt-3 pb-1 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-amber-400/90">Scenes</span>
          {layers.length > 0 && savingName === null && (
            <button
              type="button"
              onClick={() => setSavingName("")}
              className="h-6 px-2 rounded text-[11px] bg-stone-800 hover:bg-stone-700 text-stone-300 flex items-center gap-1"
              data-testid="button-soundscape-save-scene"
            >
              <Save className="h-3 w-3" /> Save mix
            </button>
          )}
        </div>
        {savingName !== null && (
          <form
            className="px-3 pb-2 flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (!savingName.trim()) return;
              saveScene.mutate({ name: savingName.trim(), layers: layers.map(({ soundId, volume, loop }) => ({ soundId, volume, loop })) });
            }}
          >
            <input
              autoFocus
              value={savingName}
              onChange={(e) => setSavingName(e.target.value)}
              placeholder="Scene name"
              maxLength={80}
              className="flex-1 min-w-0 h-7 px-2 rounded bg-stone-900 border border-stone-700 focus:border-amber-500/70 outline-none text-sm"
              data-testid="input-soundscape-scene-name"
            />
            <button type="submit" className="h-7 px-2 rounded text-xs bg-amber-600 text-white disabled:opacity-50" disabled={!savingName.trim() || saveScene.isPending}>Save</button>
            <button type="button" onClick={() => setSavingName(null)} className="h-7 px-1 text-stone-500 hover:text-stone-200"><X className="h-4 w-4" /></button>
          </form>
        )}
        <ul className="px-2 pb-2 space-y-0.5 overflow-y-auto flex-1 min-h-[80px]">
          {[...savedScenes, ...BUILT_IN_SCENES].map((scene) => (
            <li key={scene.id} className="group flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-stone-800/70">
              <button
                type="button"
                onClick={() => loadScene(scene)}
                className="flex-1 min-w-0 text-left"
                title={scene.layers.map((l) => getSound(l.soundId)?.name ?? l.soundId).join(" + ")}
                data-testid={`button-soundscape-scene-${scene.id}`}
              >
                <div className="text-sm truncate">{scene.name}</div>
                <div className="text-[10px] text-stone-500 truncate">
                  {scene.builtIn ? "Premade · " : ""}{scene.layers.map((l) => getSound(l.soundId)?.name ?? l.soundId).join(" + ")}
                </div>
              </button>
              {!scene.builtIn && (
                <button
                  type="button"
                  onClick={() => deleteScene.mutate(scene.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-stone-500 hover:text-red-400"
                  title="Delete scene"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="border-t border-stone-800 px-3 py-2">
          <PersonalLevels />
        </div>
      </div>
    </div>
  );
}
