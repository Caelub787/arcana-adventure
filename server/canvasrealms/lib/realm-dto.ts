import type { Realm } from "@workspace/db";

/**
 * Public Realm DTO. Strips Arcana credentials (tokens, webhook secret) and
 * exposes only the fields the client UI needs to render link state.
 *
 * `campaignShared` is true when this realm surfaces in the caller's realm list
 * ONLY because a GM linked it to a campaign the caller belongs to (read-only
 * viewer bridge) — i.e. the caller neither owns it nor is a collaborator on it.
 * The client uses this to render a "Shared by your GM — view only" badge.
 */
export function toRealmDto(
  row: Realm,
  opts?: { campaignShared?: boolean },
) {
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
    campaignShared: opts?.campaignShared ?? false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
