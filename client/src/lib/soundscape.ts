// Soundscape audio engine + shared-mix store.
//
// The GM's mix (SoundscapeState) is the single source of truth: the GM edits it
// through `updateSoundscape`, which applies it locally and broadcasts it; everyone
// else receives it over the websocket and `applyRemoteSoundscape`s it. One-shot
// effects go through `triggerSound`, which plays locally and asks the server to
// play it for the rest of the table.
import { gameWs } from "./api";
import {
  EMPTY_SOUNDSCAPE,
  getSound,
  normalizeSoundscapeState,
  type SoundDef,
  type SoundscapeLayer,
  type SoundscapeState,
} from "@shared/soundscape";

export interface SoundscapePrefs {
  /** Personal level for music + ambience (multiplies the GM's mix). */
  music: number;
  /** Personal level for one-shot effects. */
  sfx: number;
  muted: boolean;
}

const PREFS_KEY = "soundscape:prefs";
const FADE = 1.2; // seconds
// libmp3lame's encoder delay. Browsers that don't strip it hand us a buffer that
// is this much longer than the true loop, with the padding at the front.
const MP3_DELAY_SAMPLES = 1105;

function loadPrefs(): SoundscapePrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
    if (raw && typeof raw === "object") {
      return {
        music: typeof raw.music === "number" ? raw.music : 0.8,
        sfx: typeof raw.sfx === "number" ? raw.sfx : 0.9,
        muted: !!raw.muted,
      };
    }
  } catch {}
  return { music: 0.8, sfx: 0.9, muted: false };
}

interface Voice {
  soundId: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
  loop: boolean;
}

type Listener = () => void;

class SoundscapeEngine {
  private ctx: AudioContext | null = null;
  private mixGain: GainNode | null = null; // GM master × personal music
  private sfxGain: GainNode | null = null; // personal sfx
  private outGain: GainNode | null = null; // mute
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private voices = new Map<string, Voice>();
  private pendingStarts = new Set<string>();
  private listeners = new Set<Listener>();

  state: SoundscapeState = { ...EMPTY_SOUNDSCAPE, layers: [] };
  prefs: SoundscapePrefs = loadPrefs();
  /** True while the browser is blocking audio until the user interacts. */
  locked = true;
  /** instanceIds of layers whose (non-looping) sound has finished. */
  ended = new Set<string>();
  /** soundIds currently being previewed by this user only. */
  previewing: string | null = null;
  private previewVoice: { source: AudioBufferSourceNode; gain: GainNode } | null = null;

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
  private emit() { this.listeners.forEach((fn) => fn()); }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor: typeof AudioContext | undefined = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.outGain = ctx.createGain();
    this.outGain.connect(ctx.destination);
    this.mixGain = ctx.createGain();
    this.mixGain.connect(this.outGain);
    this.sfxGain = ctx.createGain();
    this.sfxGain.connect(this.outGain);
    this.applyLevels(true);
    this.locked = ctx.state !== "running";
    ctx.addEventListener("statechange", () => {
      const locked = ctx.state !== "running";
      if (locked === this.locked) return;
      this.locked = locked;
      // Layers aren't started while audio is blocked (their offsets would be
      // stale by the time it unblocks) — start them now, in sync.
      if (!locked) this.apply(this.state);
      else this.emit();
    });
    return ctx;
  }

  /** Call from a user gesture: browsers only allow audio after one. */
  unlock() {
    const ctx = this.ensureContext();
    if (ctx && ctx.state !== "running") ctx.resume().catch(() => {});
  }

  private applyLevels(immediate = false) {
    const ctx = this.ctx;
    if (!ctx || !this.mixGain || !this.sfxGain || !this.outGain) return;
    const t = ctx.currentTime;
    const set = (g: GainNode, v: number) => {
      g.gain.cancelScheduledValues(t);
      if (immediate) g.gain.setValueAtTime(v, t);
      else g.gain.setTargetAtTime(v, t, 0.08);
    };
    set(this.mixGain, this.state.masterVolume * this.prefs.music);
    set(this.sfxGain, this.prefs.sfx);
    set(this.outGain, this.prefs.muted ? 0 : 1);
  }

  setPrefs(patch: Partial<SoundscapePrefs>) {
    this.prefs = { ...this.prefs, ...patch };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs)); } catch {}
    this.applyLevels();
    this.emit();
  }

  private load(def: SoundDef): Promise<AudioBuffer | null> {
    let p = this.buffers.get(def.id);
    if (!p) {
      const ctx = this.ensureContext();
      if (!ctx) return Promise.resolve(null);
      p = fetch(def.file)
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
        .then((data) => new Promise<AudioBuffer>((resolve, reject) => ctx.decodeAudioData(data, resolve, reject)))
        .catch((err) => {
          console.warn(`[soundscape] failed to load ${def.id}:`, err);
          this.buffers.delete(def.id);
          return null;
        });
      this.buffers.set(def.id, p);
    }
    return p;
  }

  /** Where the real audio starts in a decoded buffer, and how long the loop is. */
  private loopWindow(def: SoundDef, buffer: AudioBuffer) {
    const extra = buffer.duration - def.duration;
    const start = extra * buffer.sampleRate >= MP3_DELAY_SAMPLES - 64 ? MP3_DELAY_SAMPLES / buffer.sampleRate : 0;
    const length = Math.min(def.duration, buffer.duration - start);
    return { start, length };
  }

  /** Reconcile what's playing with `next`: fade new layers in, gone layers out. */
  apply(next: SoundscapeState) {
    this.state = next;
    const ctx = this.ensureContext();
    if (!ctx) { this.emit(); return; }
    this.applyLevels();
    const wanted = new Map(next.layers.map((l) => [l.instanceId, l]));

    this.voices.forEach((voice, id) => {
      if (!wanted.has(id)) this.stopVoice(id, voice);
    });
    this.pendingStarts.forEach((id) => { if (!wanted.has(id)) this.pendingStarts.delete(id); });
    this.ended.forEach((id) => { if (!wanted.has(id)) this.ended.delete(id); });

    next.layers.forEach((layer) => {
      const voice = this.voices.get(layer.instanceId);
      if (voice) {
        voice.gain.gain.cancelScheduledValues(ctx.currentTime);
        voice.gain.gain.setTargetAtTime(layer.volume, ctx.currentTime, 0.08);
        if (voice.loop !== layer.loop) { voice.source.loop = layer.loop; voice.loop = layer.loop; }
      } else if (ctx.state === "running" && !this.pendingStarts.has(layer.instanceId) && !this.ended.has(layer.instanceId)) {
        this.startLayer(layer);
      }
    });
    this.emit();
  }

  private async startLayer(layer: SoundscapeLayer) {
    const def = getSound(layer.soundId);
    if (!def) return;
    this.pendingStarts.add(layer.instanceId);
    const buffer = await this.load(def);
    const ctx = this.ctx;
    // The GM may have removed it (or replaced the mix) while we were loading.
    if (!this.pendingStarts.delete(layer.instanceId) || !buffer || !ctx || !this.mixGain) return;
    const current = this.state.layers.find((l) => l.instanceId === layer.instanceId);
    if (!current) return;

    const { start, length } = this.loopWindow(def, buffer);
    const elapsed = Math.max(0, (Date.now() - current.startedAt) / 1000);
    let offset: number;
    if (current.loop) offset = elapsed % length;
    else if (elapsed < length - 0.25) offset = elapsed;
    else { this.markEnded(current.instanceId); return; }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = current.loop;
    source.loopStart = start;
    source.loopEnd = start + length;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    // Joining mid-song fades in; a fresh layer starts at once (stingers need their attack).
    const fresh = elapsed < 0.5;
    gain.gain.linearRampToValueAtTime(current.volume, ctx.currentTime + (fresh ? 0.05 : FADE));
    source.connect(gain).connect(this.mixGain);
    source.start(0, start + offset);
    const voice: Voice = { soundId: def.id, source, gain, loop: current.loop };
    source.onended = () => {
      if (this.voices.get(current.instanceId) === voice) {
        this.voices.delete(current.instanceId);
        this.markEnded(current.instanceId);
      }
    };
    this.voices.set(current.instanceId, voice);
    this.emit();
  }

  private markEnded(instanceId: string) {
    this.ended.add(instanceId);
    this.emit();
  }

  private stopVoice(id: string, voice: Voice) {
    const ctx = this.ctx;
    this.voices.delete(id);
    if (!ctx) return;
    const t = ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(t);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, t);
    voice.gain.gain.linearRampToValueAtTime(0, t + FADE);
    try { voice.source.stop(t + FADE + 0.05); } catch {}
  }

  isPlaying(instanceId: string) {
    return this.voices.has(instanceId);
  }

  isLoading(instanceId: string) {
    return this.pendingStarts.has(instanceId);
  }

  /** A one-shot for this client only (the network side lives in triggerSound). */
  async playOneShot(soundId: string, volume = 1) {
    const def = getSound(soundId);
    if (!def) return;
    this.ensureContext();
    const buffer = await this.load(def);
    const ctx = this.ctx;
    // While audio is blocked, drop one-shots rather than replaying a backlog later.
    if (!buffer || !ctx || ctx.state !== "running" || !this.sfxGain || !this.mixGain) return;
    const { start, length } = this.loopWindow(def, buffer);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    // Music/ambience fired as a one-shot (e.g. a stinger) rides the music level.
    source.connect(gain).connect(def.kind === "sfx" ? this.sfxGain : this.mixGain);
    source.start(0, start, length);
  }

  /** GM-side audition: plays through only this user's speakers. */
  async preview(soundId: string | null) {
    const ctx = this.ctx;
    if (this.previewVoice && ctx) {
      const { source, gain } = this.previewVoice;
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      try { source.stop(ctx.currentTime + 0.3); } catch {}
      this.previewVoice = null;
    }
    this.previewing = soundId;
    this.emit();
    if (!soundId) return;
    const def = getSound(soundId);
    if (!def) return;
    this.unlock();
    const buffer = await this.load(def);
    if (this.previewing !== soundId || !buffer || !this.ctx || !this.outGain) return;
    const { start, length } = this.loopWindow(def, buffer);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = def.kind === "sfx" ? this.prefs.sfx : this.prefs.music;
    source.connect(gain).connect(this.outGain);
    const voice = { source, gain };
    source.onended = () => {
      if (this.previewVoice === voice) { this.previewVoice = null; this.previewing = null; this.emit(); }
    };
    // Previews are capped so a 50s loop doesn't run on forever.
    source.start(0, start, Math.min(length, 20));
    this.previewVoice = voice;
  }
}

export const soundscape = new SoundscapeEngine();

const newInstanceId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// Slider drags change the mix every frame; the server allows ~10 messages a
// second per user, so broadcasts are throttled (always sending the latest mix).
const BROADCAST_MS = 250;
let lastBroadcast = 0;
let broadcastTimer: number | null = null;
function broadcastMix() {
  const wait = lastBroadcast + BROADCAST_MS - Date.now();
  if (wait <= 0) {
    if (broadcastTimer !== null) { window.clearTimeout(broadcastTimer); broadcastTimer = null; }
    lastBroadcast = Date.now();
    gameWs.sendSoundscapeUpdate(soundscape.state);
  } else if (broadcastTimer === null) {
    broadcastTimer = window.setTimeout(() => { broadcastTimer = null; broadcastMix(); }, wait);
  }
}

/** GM: change the shared mix and broadcast it. */
export function updateSoundscape(fn: (s: SoundscapeState) => SoundscapeState) {
  const next = normalizeSoundscapeState({ ...fn(soundscape.state), updatedAt: Date.now() });
  soundscape.apply(next);
  broadcastMix();
}

/** Everyone: adopt the mix the server just told us about. */
export function applyRemoteSoundscape(raw: unknown) {
  soundscape.apply(normalizeSoundscapeState(raw));
}

export function makeLayer(soundId: string, volume?: number, loop?: boolean): SoundscapeLayer {
  const def = getSound(soundId);
  return {
    instanceId: newInstanceId(),
    soundId,
    volume: volume ?? (def?.kind === "ambience" ? 0.55 : 0.7),
    loop: loop ?? !!def?.loop,
    startedAt: Date.now(),
  };
}

/** GM: add a sound to the mix, or remove it if it's already there. */
export function toggleLayer(soundId: string) {
  updateSoundscape((s) => {
    const existing = s.layers.find((l) => l.soundId === soundId);
    if (existing) return { ...s, layers: s.layers.filter((l) => l !== existing) };
    return { ...s, layers: [...s.layers, makeLayer(soundId)] };
  });
}

/**
 * Fire a sound "for the table": a hotbar press, a roll, an item use. Looping
 * beds (music/ambience) toggle in and out of the shared mix — GM only, since
 * the mix is theirs. Everything else plays once for everyone.
 */
export function triggerSound(soundId: string | null | undefined, opts: { isGM?: boolean; volume?: number } = {}) {
  const def = getSound(soundId);
  if (!def) return;
  soundscape.unlock();
  if (def.loop && def.kind !== "sfx") {
    if (opts.isGM) toggleLayer(def.id);
    return;
  }
  const volume = opts.volume ?? 1;
  soundscape.playOneShot(def.id, volume);
  gameWs.sendSoundscapeSfx(def.id, volume);
}
