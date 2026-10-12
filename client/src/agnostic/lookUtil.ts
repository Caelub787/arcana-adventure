// Pure helpers for looks (no React / no imports, so any module can use them).
import type { AgLook } from "@shared/agnostic/types";

/** Later looks win; undefined keys never erase earlier ones. */
export function mergeLook(...looks: Array<AgLook | undefined | null>): AgLook {
  const out: Record<string, unknown> = {};
  for (const l of looks) if (l) for (const [k, v] of Object.entries(l)) if (v !== undefined && v !== null && v !== "") out[k] = v;
  return out as AgLook;
}

export function defaultLabelPos(kind: string): NonNullable<AgLook["labelPos"]> {
  return kind === "bar" || kind === "pips" ? "above" : kind === "dial" ? "below" : "left";
}

