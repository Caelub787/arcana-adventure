// Pure helpers extracted from GameComponents.tsx so the V3 item-resolution and
// library-dedup logic can be unit-tested without booting the 29k-line component.
//
// Two problems these solve (AA V3, Task #241):
//   1. Library search showed duplicate entries when the same concept existed as
//      both a global system item and a campaign-published template.
//   2. Rune socketing / technique use intermittently failed with
//      "Host item not found" / "Weapon not found" because the UI sent a stale or
//      stacked-representative item id instead of the live owned row's id.

interface MinimalItem {
  id?: string | null;
  name?: string | null;
  system?: string | null;
  itemType?: string | null;
  templateItemId?: string | null;
  socketedRunes?: Array<{ slotIndex?: number; runeItemId?: string | null; name?: string | null }> | null;
}

/**
 * Build a stable rune-loadout signature for an item. Mirrors the signature used
 * by the inventory stacking logic so two physical copies that carry the same
 * runes resolve to the same identity, while a runed copy never matches a plain
 * copy. Empty string when the item has no socketed runes.
 */
export function runeSignature(item: MinimalItem | null | undefined): string {
  const runes = item?.socketedRunes;
  if (!Array.isArray(runes) || runes.length === 0) return '';
  return runes
    .map((r) => `${r.slotIndex}:${r.runeItemId ?? r.name ?? ''}`)
    .sort()
    .join('|');
}

/**
 * Resolve the id of the live, character-owned row that corresponds to `item`,
 * searching the raw owned `items` list.
 *
 * Resolution order:
 *   1. Exact id match — the prop id is still a live owned row (the normal case).
 *   2. Identity match by template link (`templateItemId`) + rune signature — the
 *      prop id is stale (e.g. the item was re-added and got a new id) but an
 *      equivalent owned row still exists.
 *   3. Identity match by name + itemType + rune signature — same idea when no
 *      template link is present.
 *
 * Returns `undefined` when no live owned row matches. Callers MUST treat
 * `undefined` as "block the action and force a refresh" — there is deliberately
 * NO fallback to the (possibly stale) prop id, so we never POST an id the server
 * can't find.
 */
export function resolveLiveOwnedItemId(
  item: MinimalItem | null | undefined,
  items: MinimalItem[] | null | undefined,
): string | undefined {
  const list = Array.isArray(items) ? items : [];
  if (!item) return undefined;

  // 1. Exact id — already a live owned row.
  if (item.id) {
    const exact = list.find((it) => it.id === item.id);
    if (exact?.id) return exact.id;
  }

  const itemSig = runeSignature(item);

  // 2. Template link identity (stale id case).
  if (item.templateItemId) {
    const byTemplate = list.find(
      (it) => it.templateItemId && it.templateItemId === item.templateItemId && runeSignature(it) === itemSig,
    );
    if (byTemplate?.id) return byTemplate.id;
  }

  // 3. Name + type + rune signature identity (stale id, no template link).
  if (item.name) {
    const byIdentity = list.find(
      (it) => it.name === item.name && it.itemType === item.itemType && runeSignature(it) === itemSig,
    );
    if (byIdentity?.id) return byIdentity.id;
  }

  // No live owned row — block the action.
  return undefined;
}

/**
 * De-duplicate the library template list shown in the Add Item dialog.
 *
 * Two passes:
 *   1. Exact id — the same record can appear in both the system and campaign
 *      lists; keep it once (prefer the campaign entry).
 *   2. name + system composite — a system item re-published as a campaign
 *      template produces two distinct ids for the same concept; suppress the
 *      system duplicate in favor of the campaign entry.
 *
 * Campaign entries always win; system entries are appended only when neither an
 * id nor a name+system collision exists.
 */
export function dedupeLibraryTemplates<T extends MinimalItem>(
  systemItems: T[] | null | undefined,
  campaignItems: T[] | null | undefined,
): T[] {
  const sys = Array.isArray(systemItems) ? systemItems : [];
  const camp = Array.isArray(campaignItems) ? campaignItems : [];
  const campIds = new Set(camp.map((i) => i.id));
  const nameSysKey = (i: MinimalItem) => `${(i.name || '').toLowerCase()}::${i.system || ''}`;
  const campNameSysKeys = new Set(camp.map(nameSysKey));
  const dedupedSys = sys.filter((i) => {
    if (i.id != null && campIds.has(i.id)) return false;
    return !campNameSysKeys.has(nameSysKey(i));
  });
  return [...dedupedSys, ...camp];
}
