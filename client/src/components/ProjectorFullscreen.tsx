import React, { useEffect, useRef, useState } from "react";
import { Maximize2, Monitor } from "lucide-react";

const STORAGE_KEY = "projector-display-label";

interface ScreenDetailed {
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly availLeft: number;
  readonly availTop: number;
  readonly availWidth: number;
  readonly availHeight: number;
  readonly isPrimary: boolean;
  readonly isInternal: boolean;
}

interface ScreenDetails {
  readonly screens: ReadonlyArray<ScreenDetailed>;
  readonly currentScreen: ScreenDetailed;
}

interface WindowWithScreenDetails extends Window {
  getScreenDetails?: () => Promise<ScreenDetails>;
}

interface FullscreenOptionsWithScreen extends FullscreenOptions {
  screen?: ScreenDetailed;
}

interface FullscreenElementWithScreen extends Element {
  requestFullscreen(options?: FullscreenOptionsWithScreen): Promise<void>;
}

type ScreenInfo = {
  label: string;
  width: number;
  height: number;
  isPrimary: boolean;
  isInternal: boolean;
  raw: ScreenDetailed;
};

export function ProjectorFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    typeof document !== "undefined" && !!document.fullscreenElement,
  );
  const [hasBeenFullscreen, setHasBeenFullscreen] = useState(false);
  const [screens, setScreens] = useState<ScreenInfo[] | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const screenDetailsRef = useRef<ScreenDetails | null>(null);
  const [savedLabel, setSavedLabel] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const onChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (fs) setHasBeenFullscreen(true);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const loadScreens = async (): Promise<ScreenInfo[] | null> => {
    const w = window as WindowWithScreenDetails;
    if (typeof w.getScreenDetails !== "function") return null;
    try {
      const details = await w.getScreenDetails();
      screenDetailsRef.current = details;
      const list: ScreenInfo[] = details.screens.map((s, i) => ({
        label: s.label || `Display ${i + 1} (${s.width}\u00d7${s.height})`,
        width: s.width,
        height: s.height,
        isPrimary: s.isPrimary,
        isInternal: s.isInternal,
        raw: s,
      }));
      setScreens(list);
      return list;
    } catch {
      setErrorMsg(
        "Display permission denied. Using current monitor for fullscreen.",
      );
      return null;
    }
  };

  const requestFullscreenOn = async (screenRaw?: ScreenDetailed) => {
    const el = document.documentElement as FullscreenElementWithScreen;
    try {
      if (screenRaw) {
        await el.requestFullscreen({ screen: screenRaw });
        return;
      }
      await el.requestFullscreen();
    } catch {
      try {
        await el.requestFullscreen();
      } catch {
        setErrorMsg(
          "Could not enter fullscreen. Your browser may have blocked it.",
        );
      }
    }
  };

  const handleGoFullscreen = async () => {
    setErrorMsg(null);
    const list = await loadScreens();
    if (list && list.length > 1) {
      if (savedLabel) {
        const target = list.find((s) => s.label === savedLabel);
        if (target) {
          await requestFullscreenOn(target.raw);
          return;
        }
      }
      setShowPicker(true);
      return;
    }
    await requestFullscreenOn();
  };

  const handlePickScreen = async (s: ScreenInfo) => {
    try {
      localStorage.setItem(STORAGE_KEY, s.label);
    } catch {
      // ignore storage errors (private mode etc.)
    }
    setSavedLabel(s.label);
    setShowPicker(false);
    await requestFullscreenOn(s.raw);
  };

  const handleForgetDisplay = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
    setSavedLabel(null);
  };

  if (isFullscreen) return null;

  if (hasBeenFullscreen) {
    return (
      <button
        onClick={handleGoFullscreen}
        className="fixed top-2 right-12 z-[12000] h-8 px-3 rounded-full bg-stone-900/60 hover:bg-stone-800/90 border border-stone-700/60 hover:border-amber-500 text-stone-400 hover:text-amber-400 flex items-center gap-1.5 backdrop-blur-sm shadow-lg transition-all opacity-30 hover:opacity-100 text-xs"
        title="Re-enter fullscreen"
        data-testid="button-reenter-fullscreen"
      >
        <Maximize2 className="h-3.5 w-3.5" />
        Fullscreen
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[11500] flex items-center justify-center bg-stone-950/85 backdrop-blur-sm"
      data-testid="overlay-projector-fullscreen"
    >
      <div className="bg-stone-900/95 border border-stone-700 rounded-lg p-6 shadow-2xl max-w-md w-[90%] flex flex-col gap-4">
        <div className="flex items-center gap-3 text-amber-400">
          <Monitor className="h-6 w-6" />
          <h2 className="text-lg font-semibold">Projector Mode</h2>
        </div>
        <p className="text-stone-300 text-sm">
          For the cleanest table view, go fullscreen.
          {savedLabel && !showPicker
            ? ` Will use saved display: "${savedLabel}".`
            : ""}
        </p>

        {showPicker && screens ? (
          <div className="flex flex-col gap-2" data-testid="list-screens">
            <p className="text-stone-400 text-xs">Choose a display:</p>
            {screens.map((s, i) => (
              <button
                key={`${s.label}-${i}`}
                onClick={() => handlePickScreen(s)}
                className="text-left px-3 py-2 rounded border border-stone-700 hover:border-amber-500 hover:bg-stone-800 text-stone-200 transition-colors"
                data-testid={`button-pick-screen-${i}`}
              >
                <div className="font-medium text-sm">{s.label}</div>
                <div className="text-xs text-stone-400">
                  {s.width}&times;{s.height}
                  {s.isPrimary ? " \u00b7 primary" : ""}
                  {s.isInternal ? " \u00b7 internal" : " \u00b7 external"}
                </div>
              </button>
            ))}
            <button
              onClick={() => setShowPicker(false)}
              className="text-xs text-stone-400 hover:text-stone-200 mt-1"
              data-testid="button-cancel-pick-screen"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <button
              onClick={handleGoFullscreen}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold transition-colors"
              data-testid="button-go-fullscreen"
            >
              <Maximize2 className="h-4 w-4" />
              Go Fullscreen
            </button>
            {savedLabel && (
              <button
                onClick={handleForgetDisplay}
                className="text-xs text-stone-400 hover:text-amber-400 underline self-center"
                data-testid="button-forget-display"
              >
                Forget saved display
              </button>
            )}
          </div>
        )}

        {errorMsg && (
          <p
            className="text-xs text-red-400"
            data-testid="text-fullscreen-error"
          >
            {errorMsg}
          </p>
        )}

        <p className="text-[11px] text-stone-500">
          Press Esc to exit fullscreen at any time. Projector Mode stays active.
        </p>
      </div>
    </div>
  );
}
