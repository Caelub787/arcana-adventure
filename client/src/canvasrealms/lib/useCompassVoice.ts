import { useCallback, useEffect, useRef, useState } from "react";

// Visible state of voice mode for the UI indicator. The state machine moves
// in a loop while the user is in a voice conversation:
//
//   idle  --(start)-->  listening  --(speech ends)-->  thinking
//   thinking  --(reply ready)-->  speaking  --(playback ends)-->  listening
//   speaking  --(user starts talking)-->  listening  (interrupt)
//   any  --(stop)-->  idle
//
// "error" is a terminal-ish state for mic permission denial / playback
// failure. The caller can recover by calling start() again.
export type VoiceStatus =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

type Options = {
  // Called once the recorder has captured a complete user utterance, after
  // voice-activity detection has decided the user stopped talking. The
  // caller is expected to transcribe the blob, do whatever it needs with
  // the transcript (send through Compass, classify yes/no, etc.), then
  // invoke speakAndResume(text) when it's the assistant's turn to talk.
  onSpeechEnd: (audioBlob: Blob, mimeType: string) => void | Promise<void>;
  // Optional error sink for permission denial / unexpected failures.
  onError?: (message: string) => void;
};

// Voice-activity detection thresholds, tuned for browser-recorded audio.
// Values are normalised RMS over the analyser's time-domain frame (range
// roughly 0..1 for full-scale audio).
//
// SPEECH_RMS:      voice presence threshold (low enough to trigger on quiet
//                  speech, high enough to ignore typical room hum / fans).
// SPEECH_MIN_MS:   need this much continuous above-threshold audio before
//                  we count the user as having started speaking — short
//                  pops, clicks, keyboard taps don't trip it.
// SILENCE_END_MS:  once speech has started, this much continuous silence
//                  ends the turn. Long enough that mid-sentence pauses
//                  ("um... and then... uh") don't cut the user off.
// INTERRUPT_RMS:   higher bar to count as an "interrupt" while Compass is
//                  speaking — we don't want the reply's own audio bleed
//                  through the speakers to retrigger the mic.
// INTERRUPT_MS:    user must talk for this long during playback before we
//                  cancel the reply and start recording.
const SPEECH_RMS = 0.015;
const SPEECH_MIN_MS = 180;
const SILENCE_END_MS = 1200;
const INTERRUPT_RMS = 0.045;
const INTERRUPT_MS = 260;

// Pick the best audio MIME type the current browser can record. Chrome and
// Firefox produce webm/opus; Safari (desktop & iOS) only ships mp4/aac and
// will throw if asked for webm. We fall through to "" which lets the
// browser pick its own default — better than not recording at all.
function pickRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      // fall through
    }
  }
  return "";
}

export function useCompassVoice(opts: Options) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);

  // Keep the latest callbacks in a ref so the long-lived RAF loop inside
  // start() always calls the most recent handlers instead of capturing the
  // ones from the render that first turned voice mode on.
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  }, [opts]);

  // Resources that persist for the entire voice session and must be torn
  // down together by stop()/cleanup.
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderMimeRef = useRef<string>("audio/webm");
  const recordedChunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number | null>(null);
  const vadBufRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  // VAD bookkeeping.
  const speechStartedAtRef = useRef<number | null>(null);
  const lastVoiceAtRef = useRef<number>(0);
  const interruptStartedAtRef = useRef<number | null>(null);

  // Playback state.
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackUrlRef = useRef<string | null>(null);
  // Resolves the active speakAndResume promise. Called by media events
  // (ended/error) on natural completion AND directly by stopPlayback()
  // when the user interrupts or voice mode is torn down — so the loop
  // never blocks waiting on a `src=""` audio element that may not emit
  // anything across browsers.
  const playbackResolverRef = useRef<(() => void) | null>(null);

  // High-level mode the loop is in, kept as a ref so the VAD callback —
  // which runs on rAF without re-rendering — can act on the latest mode
  // without stale-closure bugs. Mirrors React state but is the source of
  // truth for the loop itself.
  type Mode = "off" | "listening" | "thinking" | "speaking";
  const modeRef = useRef<Mode>("off");

  // Resolver for the "user just spoke" promise. Each recording cycle awaits
  // the recorder's `stop` event before handing the blob to onSpeechEnd; we
  // store the resolver here so the VAD loop can resolve it from anywhere.
  const recordingStoppedRef = useRef<(() => void) | null>(null);

  const setMode = useCallback((next: Mode) => {
    modeRef.current = next;
    if (next === "off") setStatus("idle");
    else if (next === "listening") setStatus("listening");
    else if (next === "thinking") setStatus("thinking");
    else if (next === "speaking") setStatus("speaking");
  }, []);

  // Tear down any in-flight playback and revoke the blob URL so we don't
  // leak. Safe to call repeatedly.
  const stopPlayback = useCallback(() => {
    const audio = playbackAudioRef.current;
    if (audio) {
      try {
        audio.pause();
        audio.src = "";
      } catch {
        // ignore
      }
    }
    playbackAudioRef.current = null;
    const url = playbackUrlRef.current;
    if (url) {
      URL.revokeObjectURL(url);
      playbackUrlRef.current = null;
    }
    interruptStartedAtRef.current = null;
    // Resolve any pending speakAndResume promise immediately. Some
    // browsers don't fire `ended` or `error` after pause()+src="" — by
    // owning the resolver here we guarantee the loop never stalls.
    const resolver = playbackResolverRef.current;
    playbackResolverRef.current = null;
    if (resolver) resolver();
  }, []);

  // Tear down everything: recorder, audio graph, playback, mic. Called by
  // stop() and by the unmount effect. Idempotent.
  const teardown = useCallback(() => {
    setMode("off");
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // ignore
      }
    }
    recorderRef.current = null;
    recordedChunksRef.current = [];
    if (recordingStoppedRef.current) {
      const resolver = recordingStoppedRef.current;
      recordingStoppedRef.current = null;
      resolver();
    }
    stopPlayback();
    try {
      sourceRef.current?.disconnect();
    } catch {
      // ignore
    }
    sourceRef.current = null;
    analyserRef.current = null;
    const ctx = audioCtxRef.current;
    if (ctx) {
      ctx.close().catch(() => {
        // ignore
      });
    }
    audioCtxRef.current = null;
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
    }
    streamRef.current = null;
    speechStartedAtRef.current = null;
    lastVoiceAtRef.current = 0;
    interruptStartedAtRef.current = null;
  }, [setMode, stopPlayback]);

  useEffect(() => {
    return () => {
      teardown();
    };
  }, [teardown]);

  // Compute the current RMS energy from the analyser node. Returns a
  // number in [0, 1]; 0 if the analyser hasn't been initialised yet.
  const readRms = useCallback((): number => {
    const a = analyserRef.current;
    if (!a) return 0;
    const buf =
      vadBufRef.current && vadBufRef.current.length === a.fftSize
        ? vadBufRef.current
        : new Float32Array(new ArrayBuffer(a.fftSize * 4));
    vadBufRef.current = buf;
    a.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i]!;
      sum += v * v;
    }
    return Math.sqrt(sum / buf.length);
  }, []);

  // Idempotently start a MediaRecorder writing into recordedChunksRef.
  // Called both at the top of each listening turn AND from the interrupt
  // detector during playback — starting it early on barge-in means we
  // capture the user's first syllables instead of dropping them in the
  // gap between "playback stopped" and "loop got back to listening".
  // Returns the active recorder, or null if mic isn't available.
  const ensureRecorderStarted = useCallback((): MediaRecorder | null => {
    const existing = recorderRef.current;
    if (existing && existing.state !== "inactive") return existing;
    const stream = streamRef.current;
    if (!stream) return null;
    const mime = recorderMimeRef.current;
    let recorder: MediaRecorder;
    try {
      recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
    } catch (err) {
      optsRef.current.onError?.(
        err instanceof Error ? err.message : "Recorder failed to start",
      );
      return null;
    }
    recorderRef.current = recorder;
    recordedChunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    try {
      recorder.start();
    } catch (err) {
      optsRef.current.onError?.(
        err instanceof Error ? err.message : "Recorder failed to start",
      );
      return null;
    }
    return recorder;
  }, []);

  // Wait for the current utterance to finish (VAD stop calls
  // recordingStoppedRef) and resolve with the captured audio. If a
  // recorder is already running (started by the interrupt detector
  // during the assistant's prior turn), we adopt it — its early chunks
  // become the start of this turn's audio.
  const recordOneUtterance = useCallback((): Promise<Blob | null> => {
    const recorder = ensureRecorderStarted();
    if (!recorder) return Promise.resolve(null);
    const mime = recorderMimeRef.current;
    // Don't reset speech/lastVoice timestamps if the interrupt path
    // already populated them — they mark the start of this utterance.
    if (speechStartedAtRef.current == null) {
      lastVoiceAtRef.current = 0;
    }

    return new Promise<Blob | null>((resolve) => {
      recorder.onerror = () => {
        resolve(null);
      };
      recorder.onstop = () => {
        const chunks = recordedChunksRef.current;
        recordedChunksRef.current = [];
        if (recorderRef.current === recorder) recorderRef.current = null;
        if (chunks.length === 0) {
          resolve(null);
          return;
        }
        const blob = new Blob(chunks, { type: mime || "audio/webm" });
        resolve(blob);
      };
      recordingStoppedRef.current = () => {
        try {
          if (recorder.state !== "inactive") recorder.stop();
        } catch {
          // ignore
        }
      };
    });
  }, [ensureRecorderStarted]);

  // The main analysis loop. Runs at ~60Hz while voice mode is on and reads
  // both speech onset/offset (in listening mode) and interruptions (in
  // speaking mode) from the same RMS samples.
  const tickVad = useCallback(() => {
    if (modeRef.current === "off") return;
    rafRef.current = requestAnimationFrame(tickVad);
    const now = performance.now();
    const rms = readRms();

    if (modeRef.current === "listening") {
      if (rms > SPEECH_RMS) {
        if (speechStartedAtRef.current == null) {
          speechStartedAtRef.current = now;
        }
        lastVoiceAtRef.current = now;
      }
      const started = speechStartedAtRef.current;
      if (started != null) {
        const speechMs = lastVoiceAtRef.current - started;
        const silenceMs = now - lastVoiceAtRef.current;
        if (speechMs >= SPEECH_MIN_MS && silenceMs >= SILENCE_END_MS) {
          // End-of-turn: stop the recorder. Its onstop handler resolves
          // the outer recordOneUtterance() promise with the blob.
          const stopFn = recordingStoppedRef.current;
          recordingStoppedRef.current = null;
          speechStartedAtRef.current = null;
          if (stopFn) stopFn();
        }
      }
    } else if (modeRef.current === "speaking") {
      if (rms > INTERRUPT_RMS) {
        if (interruptStartedAtRef.current == null) {
          interruptStartedAtRef.current = now;
          // Start the recorder the instant barge-in audio is detected.
          // By the time we tear down playback (INTERRUPT_MS later), the
          // recorder has already captured the start of the user's
          // utterance — otherwise those first ~260ms would be lost.
          ensureRecorderStarted();
          speechStartedAtRef.current = now;
          lastVoiceAtRef.current = now;
        } else {
          // Keep extending the "still talking" marker so VAD doesn't
          // immediately decide the utterance ended once we transition
          // back to listening.
          lastVoiceAtRef.current = now;
          if (now - interruptStartedAtRef.current >= INTERRUPT_MS) {
            interruptStartedAtRef.current = null;
            stopPlayback();
            // stopPlayback resolves the speakAndResume promise; the
            // outer loop will flip to listening and pick up the
            // already-running recorder via recordOneUtterance.
          }
        }
      } else {
        // Brief silence during the speaking window — only reset the
        // interrupt timer; keep any in-progress recorder running. If the
        // user truly stopped after a stray sound, VAD in listening mode
        // will end the (empty) turn normally.
        interruptStartedAtRef.current = null;
      }
    }
  }, [ensureRecorderStarted, readRms, stopPlayback]);

  // Outer conversation loop: as long as voice mode is on, keep recording
  // utterances. After each one fires onSpeechEnd, control briefly leaves
  // this loop (the caller drives the thinking/speaking phase via
  // speakAndResume) and returns here once playback ends, at which point
  // we start listening again.
  const runConversationLoop = useCallback(async () => {
    while ((modeRef.current as Mode) !== "off") {
      setMode("listening");
      const blob = await recordOneUtterance();
      if ((modeRef.current as Mode) === "off") return;
      if (!blob || blob.size === 0) {
        // Recorder produced nothing — just loop and try again. This is
        // usually a no-op when the user toggled voice mode off mid-turn.
        continue;
      }
      setMode("thinking");
      try {
        await optsRef.current.onSpeechEnd(blob, recorderMimeRef.current);
      } catch (err) {
        optsRef.current.onError?.(
          err instanceof Error ? err.message : "Voice handler failed",
        );
      }
      // The orchestrator's speakAndResume() has already toggled modeRef
      // back to "listening" by the time we reach this point (or to "off"
      // if the user clicked stop). The while-condition picks the right
      // branch on the next iteration.
    }
  }, [recordOneUtterance, setMode]);

  // Acquire the mic, build the audio graph, and kick off the listening
  // loop. Idempotent — calling start() again when already active is a
  // no-op. Throws errors out via onError + sets micPermissionDenied for
  // the UI.
  const start = useCallback(async () => {
    if (modeRef.current !== "off") return;
    setErrorMessage(null);
    setMicPermissionDenied(false);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      const msg =
        "Voice mode isn't supported in this browser. Try Chrome, Edge, Firefox, or Safari.";
      setErrorMessage(msg);
      setStatus("error");
      optsRef.current.onError?.(msg);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      const Ctor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctor();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      analyserRef.current = analyser;
      recorderMimeRef.current = pickRecorderMime() || "audio/webm";
      modeRef.current = "listening";
      setStatus("listening");
      rafRef.current = requestAnimationFrame(tickVad);
      // Kick off the loop. It owns the recording cycle from here.
      void runConversationLoop();
    } catch (err) {
      teardown();
      const e = err as DOMException | Error;
      const isPermission =
        (e as DOMException).name === "NotAllowedError" ||
        (e as DOMException).name === "SecurityError" ||
        /permission/i.test(e.message ?? "");
      const msg = isPermission
        ? "Microphone access was blocked. Allow mic permission in your browser, then click the mic again."
        : `Couldn't start the mic: ${e.message ?? "unknown error"}`;
      setMicPermissionDenied(!!isPermission);
      setErrorMessage(msg);
      setStatus("error");
      optsRef.current.onError?.(msg);
    }
  }, [runConversationLoop, teardown, tickVad]);

  const stop = useCallback(() => {
    teardown();
  }, [teardown]);

  // Stream a TTS audio response to the user, then automatically return to
  // listening so the conversation loop can pick up the next utterance.
  // Resolves once playback either completes or is interrupted by the user
  // talking over Compass. Pass `null` to skip the speaking phase entirely
  // (e.g. when the assistant reply was empty) and go straight back to
  // listening.
  const speakAndResume = useCallback(
    async (audioBlob: Blob | null) => {
      if (modeRef.current === "off") return;
      if (audioBlob && audioBlob.size > 0) {
        setMode("speaking");
        const url = URL.createObjectURL(audioBlob);
        playbackUrlRef.current = url;
        const audio = new Audio(url);
        playbackAudioRef.current = audio;
        await new Promise<void>((resolve) => {
          let resolved = false;
          const settle = () => {
            if (resolved) return;
            resolved = true;
            audio.removeEventListener("ended", settle);
            audio.removeEventListener("error", settle);
            // If the user interrupted, stopPlayback() has already nulled
            // the ref + revoked the URL. Otherwise do that cleanup here.
            if (playbackAudioRef.current === audio) {
              playbackAudioRef.current = null;
            }
            if (playbackUrlRef.current === url) {
              URL.revokeObjectURL(url);
              playbackUrlRef.current = null;
            }
            if (playbackResolverRef.current === settle) {
              playbackResolverRef.current = null;
            }
            resolve();
          };
          // Register so stopPlayback (called from interrupt detection or
          // teardown) can unblock the await without depending on the
          // audio element emitting `ended` after src="".
          playbackResolverRef.current = settle;
          audio.addEventListener("ended", settle);
          audio.addEventListener("error", settle);
          audio.play().catch(() => settle());
        });
      }
      if ((modeRef.current as Mode) === "off") return;
      // Hand control back to the recording loop. The loop is currently
      // awaiting onSpeechEnd; setting the mode here means the next
      // iteration of its while will go straight into recordOneUtterance.
      setMode("listening");
    },
    [setMode],
  );

  return {
    status,
    errorMessage,
    micPermissionDenied,
    start,
    stop,
    speakAndResume,
    isActive: status !== "idle" && status !== "error",
  };
}
