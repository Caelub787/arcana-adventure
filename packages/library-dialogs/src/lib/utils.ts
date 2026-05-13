/** Tiny className composer used by package primitives. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Convert empty strings/null to `undefined` for optional numeric fields. */
export function optionalNum(val: unknown): number | undefined {
  if (val === "" || val === undefined || val === null) return undefined;
  const n = Number(val);
  return Number.isNaN(n) ? undefined : n;
}

/** Convert `_none` sentinel back to empty string (matches Arcana convention). */
export function normalizeNone(val: string | undefined | null): string {
  return val === "_none" ? "" : (val ?? "");
}

export function uid(prefix = "ld"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
