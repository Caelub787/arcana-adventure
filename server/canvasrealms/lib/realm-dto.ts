import type { Realm } from "@workspace/db";

/**
 * Public Realm DTO. Strips Arcana credentials (tokens, webhook secret) and
 * exposes only the fields the client UI needs to render link state.
 */
export function toRealmDto(row: Realm) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    accent: row.accent,
    ownerUserId: row.ownerUserId,
    arcanaLinked: !!row.arcanaAccessToken,
    arcanaUserDisplay: row.arcanaUserDisplay,
    arcanaSystem: row.arcanaSystem,
    arcanaHost: row.arcanaHost,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
