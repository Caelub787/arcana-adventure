/**
 * Canonical Arcana game-system options for a realm. The `value` is the slug
 * stored in `realms.arcana_system` and sent as the `system` slug to the
 * Arcana library on entity create/update; the `label` is what users pick in
 * the create-realm dialog and realm settings.
 */
export const ARCANA_SYSTEM_OPTIONS: { value: string; label: string }[] = [
  { value: "arcana-adventure", label: "Arcana Adventure (V1)" },
  { value: "aa-v2", label: "A.A. V2" },
  { value: "aa-v3", label: "A.A. V3" },
];
