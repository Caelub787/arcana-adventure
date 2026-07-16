export type AppTheme =
  | "cartographers-study"
  | "arcane-library"
  | "sagebound-workshop";

export const DEFAULT_THEME: AppTheme = "cartographers-study";

export const APP_THEMES: AppTheme[] = [
  "cartographers-study",
  "arcane-library",
  "sagebound-workshop",
];

export const THEME_STORAGE_KEY = "aa-theme";

export interface ThemeMeta {
  id: AppTheme;
  name: string;
  description: string;
  /** Small preview swatches: background, surface, border, primary, text */
  swatches: string[];
}

export const THEME_META: ThemeMeta[] = [
  {
    id: "cartographers-study",
    name: "Cartographer's Study",
    description:
      "Warm charcoal, aged parchment, antique gold, and dark wood tones inspired by a fantasy mapmaker's study.",
    swatches: ["#1C1A1D", "#35323B", "#4A4650", "#C99A3D", "#ECE7DE"],
  },
  {
    id: "arcane-library",
    name: "Arcane Library",
    description:
      "Deep indigo surfaces, restrained violet magic, cool blue highlights, and aged gold.",
    swatches: ["#171822", "#27293A", "#454961", "#7C6CF4", "#F1F3F7"],
  },
  {
    id: "sagebound-workshop",
    name: "Sagebound Workshop",
    description:
      "Soft charcoal, earthy brown, sage green, muted gold, and parchment tones for a calmer fantasy atmosphere.",
    swatches: ["#252525", "#393432", "#554D49", "#7D8F69", "#EFE8DD"],
  },
];

export function isAppTheme(value: unknown): value is AppTheme {
  return typeof value === "string" && (APP_THEMES as string[]).includes(value);
}

export function normalizeTheme(value: unknown): AppTheme {
  return isAppTheme(value) ? value : DEFAULT_THEME;
}

export function getStoredTheme(): AppTheme {
  try {
    return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

/**
 * Applies the theme to <html data-theme="..."> immediately and persists it to
 * localStorage. A short-lived "theme-transition" class enables subtle
 * color transitions only while switching (no steady-state perf cost).
 */
export function applyTheme(theme: AppTheme, options?: { animate?: boolean }): void {
  const root = document.documentElement;
  if (options?.animate && root.getAttribute("data-theme") !== theme) {
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 400);
  }
  root.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // localStorage unavailable (private mode etc.) — theme still applies for this session
  }
}
