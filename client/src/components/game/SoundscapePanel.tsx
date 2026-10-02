// Soundscape: a tab at the top-centre of the table that opens a floating
// panel — draggable/resizable on desktop, full-screen on mobile (both via
// FloatingPanel). GMs get the full mixer (library, layers, scenes); players
// get their own volume controls for whatever the GM is playing.
//
// The panel's content lays itself out by its own width, not the viewport's:
// wide → library beside the mixer; narrow (a phone, or a desktop panel the GM
// shrank) → Library / Mixer / Scenes tabs.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Music, Play, Plus, Repeat, Save, Search, Square, Trash2, Volume2, VolumeX, X, Zap,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { FloatingPanel } from "@/components/ui/floating-panel";
import { useIsMobile } from "@/hooks/use-mobile";
import { api, gameWs } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  applyRemoteSoundscape, makeLayer, soundscape, toggleLayer, triggerSound, updateSoundscape,
} from "@/lib/soundscape";
import {
  BUILT_IN_SCENES, EMPTY_SOUNDSCAPE, SOUNDSCAPE_LIBRARY, getSound,
  type SoundDef, type SoundKind, type SoundscapeScene, type SoundscapeSceneLayer,
} from "@shared/soundscape";

const KIND_TABS: { kind: SoundKind; label: string }[] = [
  { kind: "music", label: "Music" },
  { kind: "ambience", label: "Ambience" },
  { kind: "sfx", label: "Effects" },
];

/** Below this panel width the GM mixer switches to tabs. */
const TWO_COLUMN_MIN = 640;

function useSoundscapeVersion() {
  // The engine is a mutable singleton; re-render on any change it reports.
  const versionRef = useRef(0);
  return useSyncExternalStore(
    (fn) => soundscape.subscribe(() => { versionRef.current++; fn(); }),
    () => versionRef.current,
  );
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m ? `${m}:${String(r).padStart(2, "0")}` : `${s.toFixed(s < 10 ? 1 : 0)}s`;
}

function VolumeRow({ value, onChange, label, muted }: { value: number; onChange: (v: number) => void; label?: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-2 min-w-0 py-1">
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

const sectionLabel = "text-xs uppercase tracking-wider text-amber-400/90";
const smallBtn = "h-8 sm:h-7 px-2.5 rounded text-xs flex items-center gap-1 shrink-0";

interface Props {
  campaignId: string;
  isGM: boolean;
  /** Spectator/cast views still hear the mix but show no controls. */
  hideControls?: boolean;
}

export function SoundscapePanel({ campaignId, isGM, hideControls }: Props) {
  useSoundscapeVersion();
  const isMobile = useIsMobile();
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

  // Stop any private preview when the panel closes.
  useEffect(() => { if (!open) soundscape.preview(null); }, [open]);

  if (hideControls) return null;

  const layers = soundscape.state.layers;
  const playingCount = layers.length;
  // Players only see the tab once there's something to hear.
  if (!isGM && playingCount === 0) return null;

  const { prefs, locked } = soundscape;
  const eqBars = playingCount > 0 && (
    <span className="flex items-end gap-[2px] h-3" aria-label={`${playingCount} playing`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[3px] bg-amber-400 rounded-sm"
          style={{
            height: "100%",
            animation: locked || prefs.muted ? undefined : `soundscape-eq 0.9s ${i * 0.15}s ease-in-out infinite alternate`,
            transform: locked || prefs.muted ? "scaleY(0.3)" : undefined,
            transformOrigin: "bottom",
          }}
        />
      ))}
    </span>
  );

  const panelWidth = isGM ? 800 : 340;
  const panelHeight = isGM ? 580 : 320;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;

  return (
    <>
      <div
        className="fixed top-3 left-1/2 -translate-x-1/2 z-40 pointer-events-auto flex flex-col items-center"
        data-testid="soundscape-panel"
      >
        <button
          type="button"
          onClick={() => { soundscape.unlock(); setOpen((o) => !o); }}
          className={`chrome-frame chrome-btn flex items-center gap-2 h-10 sm:h-9 px-3 rounded-md border backdrop-blur-sm shadow-lg text-sm transition-colors ${
            open ? "bg-stone-900/90 border-amber-500 text-amber-300" : "bg-stone-900/70 hover:bg-stone-800/90 border-stone-600/60 hover:border-amber-500/60 text-white/85"
          }`}
          aria-label="Soundscape"
          aria-expanded={open}
          data-testid="button-soundscape-tab"
        >
          <Music className="h-4 w-4" />
          {/* On a phone the top bar is crowded — the icon and the live bars say enough. */}
          <span className="hidden sm:inline font-medium tracking-wide">Soundscape</span>
          {eqBars}
          {prefs.muted && <VolumeX className="h-4 w-4 text-red-400" />}
        </button>
        <style>{`@keyframes soundscape-eq { from { transform: scaleY(0.25) } to { transform: scaleY(1) } }`}</style>

        {locked && playingCount > 0 && !open && (
          <button
            type="button"
            onClick={() => soundscape.unlock()}
            className="mt-1 text-xs px-3 py-1.5 rounded bg-amber-600/90 text-white shadow animate-pulse"
          >
            Tap to enable sound
          </button>
        )}
      </div>

      <FloatingPanel
        open={open}
        onClose={() => setOpen(false)}
        title={
          <span className="flex items-center gap-2">
            <Music className="h-4 w-4 text-amber-400" /> Soundscape {eqBars}
          </span>
        }
        panelKey="soundscape"
        defaultSize={{ width: Math.min(panelWidth, vw - 32), height: panelHeight }}
        defaultPosition={{ x: Math.max(16, Math.round((vw - Math.min(panelWidth, vw - 32)) / 2)), y: 64 }}
        minWidth={300}
        minHeight={260}
      >
        {isGM ? <GMMixer campaignId={campaignId} forceTabs={isMobile} /> : <PlayerControls />}
      </FloatingPanel>
    </>
  );
}

function PersonalLevels() {
  const { prefs } = soundscape;
  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => soundscape.setPrefs({ muted: !prefs.muted })}
          className={`h-8 w-8 grid place-items-center rounded hover:bg-stone-700/60 ${prefs.muted ? "text-red-400" : "text-stone-300"}`}
          title={prefs.muted ? "Unmute" : "Mute for me"}
          aria-label={prefs.muted ? "Unmute" : "Mute for me"}
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

function PlayerControls() {
  const layers = soundscape.state.layers;
  return (
    <div className="p-3 space-y-3 text-stone-200">
      <div className={sectionLabel}>Now playing</div>
      <ul className="space-y-1.5">
        {layers.map((l) => (
          <li key={l.instanceId} className="flex items-center gap-2 text-sm">
            <Music className="h-3.5 w-3.5 text-amber-400/80 shrink-0" />
            <span className="truncate">{getSound(l.soundId)?.name ?? l.soundId}</span>
          </li>
        ))}
        {layers.length === 0 && <li className="text-xs text-stone-500">Nothing playing.</li>}
      </ul>
      <div className="border-t border-stone-800 pt-2">
        <PersonalLevels />
      </div>
    </div>
  );
}

type SavedScene = SoundscapeScene & { builtIn?: false };
type MixerTab = "library" | "mixer" | "scenes";

function GMMixer({ campaignId, forceTabs }: { campaignId: string; forceTabs: boolean }) {
  const [rootRef, width] = useElementWidth<HTMLDivElement>();
  const tabbed = forceTabs || (width > 0 && width < TWO_COLUMN_MIN);
  const [tab, setTab] = useState<MixerTab>("library");
  const layerCount = soundscape.state.layers.length;

  return (
    <div ref={rootRef} className="h-full min-h-0 flex flex-col text-stone-200" data-testid="soundscape-mixer">
      {tabbed ? (
        <>
          <div className="flex gap-1 p-2 border-b border-stone-800 shrink-0" role="tablist">
            {([
              ["library", "Library"],
              ["mixer", layerCount ? `Mixer · ${layerCount}` : "Mixer"],
              ["scenes", "Scenes"],
            ] as [MixerTab, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`flex-1 h-9 rounded text-sm font-medium ${tab === key ? "bg-amber-600/90 text-white" : "bg-stone-800/80 text-stone-300"}`}
                data-testid={`tab-soundscape-${key}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 flex flex-col">
            {tab === "library" && <LibraryPane touch />}
            {tab === "mixer" && (
              <div className="flex-1 min-h-0 overflow-y-auto">
                <MixerPane />
                <div className="border-t border-stone-800 px-3 py-2"><PersonalLevels /></div>
              </div>
            )}
            {tab === "scenes" && <div className="flex-1 min-h-0 overflow-y-auto"><ScenesPane campaignId={campaignId} touch /></div>}
          </div>
        </>
      ) : (
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 flex flex-col border-r border-stone-700/70">
            <LibraryPane />
          </div>
          <div className="w-[300px] shrink-0 flex flex-col min-h-0 overflow-y-auto">
            <MixerPane />
            <ScenesPane campaignId={campaignId} />
            <div className="border-t border-stone-800 px-3 py-2 mt-auto"><PersonalLevels /></div>
          </div>
        </div>
      )}
    </div>
  );
}

function LibraryPane({ touch }: { touch?: boolean }) {
  const [kind, setKind] = useState<SoundKind>("music");
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
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
  const inMix = new Set(soundscape.state.layers.map((l) => l.soundId));

  return (
    <>
      <div className="p-2.5 space-y-2 border-b border-stone-800 shrink-0">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sounds — sword, rain, dragon…"
            className="w-full h-9 pl-8 pr-8 rounded bg-stone-900 border border-stone-700 focus:border-amber-500/70 outline-none text-base sm:text-sm placeholder:text-stone-500"
            data-testid="input-soundscape-search"
          />
          {searching && (
            <button type="button" onClick={() => setQuery("")} className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 grid place-items-center text-stone-500 hover:text-stone-200" aria-label="Clear search">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {!searching && (
          <>
            <div className="flex gap-1">
              {KIND_TABS.map((t) => (
                <button
                  key={t.kind}
                  type="button"
                  onClick={() => { setKind(t.kind); setCategory(null); }}
                  className={`flex-1 h-8 sm:h-7 rounded text-xs font-medium tracking-wide ${kind === t.kind ? "bg-amber-600/90 text-white" : "bg-stone-800/80 text-stone-300 hover:bg-stone-700"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {categories.length > 1 && (
              // One swipeable row on touch; wraps on desktop.
              <div className={`flex gap-1 ${touch ? "overflow-x-auto no-scrollbar -mx-2.5 px-2.5" : "flex-wrap"}`}>
                {categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(category === c ? null : c)}
                    className={`px-2.5 h-7 sm:h-6 rounded-full text-[11px] border whitespace-nowrap shrink-0 ${category === c ? "border-amber-500 text-amber-300 bg-amber-500/10" : "border-stone-700 text-stone-400 hover:text-stone-200"}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <ul className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-1.5 space-y-0.5">
        {results.map((s) => (
          <LibraryRow key={s.id} sound={s} showCategory={searching} inMix={inMix.has(s.id)} />
        ))}
        {results.length === 0 && <li className="text-xs text-stone-500 p-3 text-center">No sounds match “{query}”.</li>}
      </ul>
    </>
  );
}

function LibraryRow({ sound: s, showCategory, inMix }: { sound: SoundDef; showCategory: boolean; inMix: boolean }) {
  const previewing = soundscape.previewing === s.id;
  const bed = s.loop && s.kind !== "sfx";
  return (
    <li className="flex items-center gap-1.5 rounded px-1.5 py-1.5 hover:bg-stone-800/70">
      <button
        type="button"
        onClick={() => soundscape.preview(previewing ? null : s.id)}
        className={`h-8 w-8 sm:h-7 sm:w-7 shrink-0 grid place-items-center rounded ${previewing ? "bg-amber-500 text-stone-950" : "bg-stone-800 text-stone-300 hover:text-amber-300"}`}
        title={previewing ? "Stop preview" : "Preview (only you hear it)"}
        aria-label={previewing ? `Stop preview of ${s.name}` : `Preview ${s.name}`}
      >
        {previewing ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-sm truncate">{s.name}</div>
        <div className="text-[10px] text-stone-500 truncate">
          {showCategory ? `${s.category} · ` : ""}{s.loop ? `Loop · ${fmtTime(s.duration)}` : fmtTime(s.duration)}
        </div>
      </div>
      {!bed && (
        <button
          type="button"
          onClick={() => triggerSound(s.id, { isGM: true, volume: 1 })}
          className={`${smallBtn} bg-stone-800 hover:bg-amber-600 hover:text-white text-stone-300`}
          title="Play once for everyone"
          data-testid={`button-soundscape-play-${s.id}`}
        >
          <Zap className="h-3 w-3" /> Play
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          soundscape.unlock();
          if (inMix && s.loop) toggleLayer(s.id);
          else updateSoundscape((st) => ({ ...st, layers: [...st.layers, makeLayer(s.id)] }));
        }}
        className={`${smallBtn} ${inMix && s.loop ? "bg-amber-600 text-white" : "bg-stone-800 hover:bg-stone-700 text-stone-300"}`}
        title={inMix && s.loop ? "Remove from the mix" : "Add to the mix"}
        data-testid={`button-soundscape-add-${s.id}`}
      >
        {inMix && s.loop ? <><Square className="h-3 w-3" /> Stop</> : <><Plus className="h-3 w-3" /> Mix</>}
      </button>
    </li>
  );
}

function MixerPane() {
  const layers = soundscape.state.layers;
  const setLayer = (instanceId: string, patch: { volume?: number; loop?: boolean }) =>
    updateSoundscape((s) => ({ ...s, layers: s.layers.map((l) => (l.instanceId === instanceId ? { ...l, ...patch } : l)) }));

  return (
    <div className="shrink-0">
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <span className={sectionLabel}>Now playing</span>
        {layers.length > 0 && (
          <button
            type="button"
            onClick={() => updateSoundscape((s) => ({ ...s, layers: [] }))}
            className={`${smallBtn} bg-stone-800 hover:bg-red-700 text-stone-300 hover:text-white`}
            data-testid="button-soundscape-stop-all"
          >
            <Square className="h-3 w-3" /> Stop all
          </button>
        )}
      </div>
      <div className="px-3">
        <VolumeRow label="Table" value={soundscape.state.masterVolume} onChange={(masterVolume) => updateSoundscape((s) => ({ ...s, masterVolume }))} />
      </div>
      <ul className="px-2 pb-2 space-y-1">
        {layers.length === 0 && <li className="text-xs text-stone-500 px-1 py-2">Nothing playing. Add sounds from the library or load a scene.</li>}
        {layers.map((l) => {
          const def = getSound(l.soundId);
          const loading = soundscape.isLoading(l.instanceId);
          return (
            <li key={l.instanceId} className="rounded bg-stone-900/80 border border-stone-800 px-2 py-1.5" data-testid={`soundscape-layer-${l.soundId}`}>
              <div className="flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${loading ? "bg-stone-500 animate-pulse" : "bg-amber-400"}`} />
                <span className="text-sm truncate flex-1 ml-1">{def?.name ?? l.soundId}</span>
                <button
                  type="button"
                  onClick={() => setLayer(l.instanceId, { loop: !l.loop })}
                  className={`h-8 w-8 sm:h-7 sm:w-7 grid place-items-center rounded ${l.loop ? "text-amber-300 bg-amber-500/15" : "text-stone-500 hover:text-stone-200"}`}
                  title={l.loop ? "Looping — click to play out once" : "Plays once — click to loop"}
                  aria-label={l.loop ? "Turn loop off" : "Turn loop on"}
                  aria-pressed={l.loop}
                >
                  <Repeat className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => updateSoundscape((s) => ({ ...s, layers: s.layers.filter((x) => x.instanceId !== l.instanceId) }))}
                  className="h-8 w-8 sm:h-7 sm:w-7 grid place-items-center rounded text-stone-500 hover:text-red-400"
                  title="Fade out"
                  aria-label={`Remove ${def?.name ?? l.soundId}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <VolumeRow value={l.volume} onChange={(volume) => setLayer(l.instanceId, { volume })} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ScenesPane({ campaignId, touch }: { campaignId: string; touch?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [savingName, setSavingName] = useState<string | null>(null);
  const layers = soundscape.state.layers;

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

  const loadScene = (scene: SoundscapeScene) => {
    soundscape.unlock();
    updateSoundscape((s) => ({ ...s, layers: scene.layers.map((l) => makeLayer(l.soundId, l.volume, l.loop)) }));
  };

  return (
    <div className="shrink-0">
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <span className={sectionLabel}>Scenes</span>
        {layers.length > 0 && savingName === null && (
          <button
            type="button"
            onClick={() => setSavingName("")}
            className={`${smallBtn} bg-stone-800 hover:bg-stone-700 text-stone-300`}
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
            className="flex-1 min-w-0 h-8 px-2 rounded bg-stone-900 border border-stone-700 focus:border-amber-500/70 outline-none text-base sm:text-sm"
            data-testid="input-soundscape-scene-name"
          />
          <button type="submit" className="h-8 px-3 rounded text-xs bg-amber-600 text-white disabled:opacity-50" disabled={!savingName.trim() || saveScene.isPending}>Save</button>
          <button type="button" onClick={() => setSavingName(null)} className="h-8 w-8 grid place-items-center text-stone-500 hover:text-stone-200" aria-label="Cancel"><X className="h-4 w-4" /></button>
        </form>
      )}
      <ul className="px-2 pb-2 space-y-0.5">
        {[...savedScenes, ...BUILT_IN_SCENES].map((scene) => {
          const summary = scene.layers.map((l) => getSound(l.soundId)?.name ?? l.soundId).join(" + ");
          return (
            <li key={scene.id} className="group flex items-center gap-1.5 rounded px-1.5 py-1.5 hover:bg-stone-800/70">
              <button
                type="button"
                onClick={() => loadScene(scene)}
                className="flex-1 min-w-0 text-left"
                title={summary}
                data-testid={`button-soundscape-scene-${scene.id}`}
              >
                <div className="text-sm truncate">{scene.name}</div>
                <div className="text-[10px] text-stone-500 truncate">{scene.builtIn ? "Premade · " : ""}{summary}</div>
              </button>
              {!scene.builtIn && (
                <button
                  type="button"
                  onClick={() => deleteScene.mutate(scene.id)}
                  // No hover on touch screens — keep delete visible there.
                  className={`h-8 w-8 sm:h-7 sm:w-7 grid place-items-center text-stone-500 hover:text-red-400 ${touch ? "" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}
                  title="Delete scene"
                  aria-label={`Delete ${scene.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
