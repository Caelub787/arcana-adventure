// Central registry of the app's game systems.
//
// Two identifiers exist for every system and they are NOT interchangeable:
//   - the SLUG  ('ca', 'swampy', 'aa-v3', ...) is what `campaigns.system` and
//     the `system` column on every admin/library table stores.
//   - the LABEL ('C.A.', 'Swampy', 'A.A. V3', ...) is what the species tables
//     and the admin system picker key on (see .agents/memory/aa-v3-system-naming.md).
// Getting the two mixed up silently returns zero rows, so always convert with
// `systemLabel()` / `systemSlug()` rather than hand-rolling a ternary.

export type SystemSlug =
  | "arcana-adventure"
  | "aa-v2"
  | "aa-v3"
  | "ca"
  | "swampy";

export const SYSTEM_SLUGS: SystemSlug[] = [
  "arcana-adventure",
  "aa-v2",
  "aa-v3",
  "ca",
  "swampy",
];

export const SYSTEM_LABELS: Record<SystemSlug, string> = {
  "arcana-adventure": "Arcana Adventure",
  "aa-v2": "A.A. V2",
  "aa-v3": "A.A. V3",
  ca: "C.A.",
  swampy: "Swampy",
};

/** Longer name shown in tooltips next to the short label. */
export const SYSTEM_FULL_NAMES: Partial<Record<SystemSlug, string>> = {
  ca: "Cultivator's Adventure",
  swampy: "Swampy",
};

const LABEL_TO_SLUG: Record<string, SystemSlug> = Object.entries(SYSTEM_LABELS)
  .reduce((acc, [slug, label]) => {
    acc[label] = slug as SystemSlug;
    return acc;
  }, {} as Record<string, SystemSlug>);

export const DEFAULT_SYSTEM_SLUG: SystemSlug = "arcana-adventure";

/** Slug -> display label. Unknown slugs are returned unchanged. */
export function systemLabel(slug?: string | null): string {
  if (!slug) return SYSTEM_LABELS[DEFAULT_SYSTEM_SLUG];
  return SYSTEM_LABELS[slug as SystemSlug] ?? slug;
}

/** Display label -> slug. Unknown labels fall back to the default system. */
export function systemSlug(label?: string | null): SystemSlug {
  if (!label) return DEFAULT_SYSTEM_SLUG;
  return LABEL_TO_SLUG[label] ?? DEFAULT_SYSTEM_SLUG;
}

// ---------------------------------------------------------------------------
// Which systems ordinary users may start a campaign in.
//
// The three older systems are incomplete, so a new user picking one of them
// lands in a half-built ruleset. Non-admins therefore only see the two live
// systems; admins still see everything so existing campaigns stay editable.
// ---------------------------------------------------------------------------

export const PUBLIC_SYSTEM_SLUGS: SystemSlug[] = ["ca", "swampy"];

export function isPublicSystem(slug?: string | null): boolean {
  return PUBLIC_SYSTEM_SLUGS.includes(slug as SystemSlug);
}

/** Systems offered in a campaign-creation / library picker for this viewer. */
export function selectableSystemSlugs(isAdmin: boolean): SystemSlug[] {
  return isAdmin ? [...SYSTEM_SLUGS] : [...PUBLIC_SYSTEM_SLUGS];
}
