// Soundscape: the GM's campaign-wide music/ambience/SFX mixer.
// The audio library itself is static (client/public/soundscape/*.mp3), described by
// SOUNDSCAPE_LIBRARY; what's *playing* is a SoundscapeState the GM broadcasts.
import { SOUNDSCAPE_LIBRARY } from "./soundscapeLibrary";

export { SOUNDSCAPE_LIBRARY };

export type SoundKind = "music" | "ambience" | "sfx";

export interface SoundDef {
  id: string;
  name: string;
  category: string;
  kind: SoundKind;
  /** Whether the sound is designed to loop seamlessly (music/ambience beds). */
  loop: boolean;
  /** Exact loop length for loops; full length for one-shots (seconds). */
  duration: number;
  file: string;
  tags: string[];
}

/** One sound currently playing in the shared mix. */
export interface SoundscapeLayer {
  instanceId: string;
  soundId: string;
  volume: number; // 0..1
  loop: boolean;
  /** Server-agnostic wall-clock ms when the layer started, so late joiners pick up mid-loop. */
  startedAt: number;
}

export interface SoundscapeState {
  layers: SoundscapeLayer[];
  masterVolume: number; // 0..1, the GM's mix level for everyone
  updatedAt: number;
}

/** A saved mix the GM can recall in one click. */
export interface SoundscapeSceneLayer {
  soundId: string;
  volume: number;
  loop: boolean;
}

export interface SoundscapeScene {
  id: string;
  name: string;
  layers: SoundscapeSceneLayer[];
  builtIn?: boolean;
}

export const EMPTY_SOUNDSCAPE: SoundscapeState = { layers: [], masterVolume: 0.8, updatedAt: 0 };

const BY_ID = new Map<string, SoundDef>(SOUNDSCAPE_LIBRARY.map((s) => [s.id, s]));
export const getSound = (id: string | null | undefined): SoundDef | undefined => (id ? BY_ID.get(id) : undefined);
export const isKnownSound = (id: unknown): id is string => typeof id === "string" && BY_ID.has(id);

/** Premade mixes, shown alongside the GM's own saved scenes. */
export const BUILT_IN_SCENES: SoundscapeScene[] = [
  { id: "builtin-tavern-night", name: "Tavern Night", builtIn: true, layers: [
    { soundId: "tavern_revelry", volume: 0.55, loop: true }, { soundId: "tavern_crowd", volume: 0.5, loop: true }, { soundId: "campfire", volume: 0.3, loop: true }] },
  { id: "builtin-dungeon-crawl", name: "Dungeon Crawl", builtIn: true, layers: [
    { soundId: "dungeon_depths", volume: 0.6, loop: true }, { soundId: "cave_drips", volume: 0.45, loop: true }] },
  { id: "builtin-storm-at-sea", name: "Storm at Sea", builtIn: true, layers: [
    { soundId: "ocean_voyage", volume: 0.45, loop: true }, { soundId: "thunderstorm", volume: 0.6, loop: true }, { soundId: "ocean_waves", volume: 0.45, loop: true }] },
  { id: "builtin-forest-camp", name: "Forest Camp at Night", builtIn: true, layers: [
    { soundId: "mystic_forest", volume: 0.4, loop: true }, { soundId: "night_crickets", volume: 0.55, loop: true }, { soundId: "campfire", volume: 0.5, loop: true }] },
  { id: "builtin-desert-road", name: "Desert Crossing", builtIn: true, layers: [
    { soundId: "desert_caravan", volume: 0.55, loop: true }, { soundId: "wind", volume: 0.4, loop: true }] },
  { id: "builtin-boss-fight", name: "Boss Fight", builtIn: true, layers: [
    { soundId: "boss_battle", volume: 0.7, loop: true }, { soundId: "thunderstorm", volume: 0.25, loop: true }] },
  { id: "builtin-haunted", name: "Haunted Manor", builtIn: true, layers: [
    { soundId: "haunted_halls", volume: 0.6, loop: true }, { soundId: "wind", volume: 0.3, loop: true }, { soundId: "rain", volume: 0.25, loop: true }] },
  { id: "builtin-royal", name: "Audience with the Crown", builtIn: true, layers: [
    { soundId: "royal_court", volume: 0.6, loop: true }] },
];

const clamp01 = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : d; };

/** Sanitise a state from the wire: unknown sounds are dropped, numbers clamped. */
export function normalizeSoundscapeState(raw: unknown): SoundscapeState {
  if (!raw || typeof raw !== "object") return { ...EMPTY_SOUNDSCAPE, layers: [] };
  const r = raw as any;
  const layers: SoundscapeLayer[] = (Array.isArray(r.layers) ? r.layers : [])
    .filter((l: any) => l && isKnownSound(l.soundId))
    .slice(0, 24)
    .map((l: any) => ({
      instanceId: typeof l.instanceId === "string" && l.instanceId ? l.instanceId.slice(0, 64) : Math.random().toString(36).slice(2),
      soundId: l.soundId,
      volume: clamp01(l.volume, 0.7),
      loop: !!l.loop,
      startedAt: Number.isFinite(Number(l.startedAt)) ? Number(l.startedAt) : Date.now(),
    }));
  return { layers, masterVolume: clamp01(r.masterVolume, 0.8), updatedAt: Number(r.updatedAt) || Date.now() };
}

export function normalizeSceneLayers(raw: unknown): SoundscapeSceneLayer[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((l: any) => l && isKnownSound(l.soundId))
    .slice(0, 24)
    .map((l: any) => ({ soundId: l.soundId, volume: clamp01(l.volume, 0.7), loop: !!l.loop }));
}
