// Shared item list ordering: alphabetical by name first, then by rarity rank.
// Used by the admin item list and the character-sheet item-add picker so
// items always appear in a stable, predictable order.

const RARITY_RANK: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

export function compareItemsByNameThenRarity(a: any, b: any): number {
  const nameCmp = (a?.name || '').localeCompare(b?.name || '', undefined, { sensitivity: 'base' });
  if (nameCmp !== 0) return nameCmp;
  const ra = RARITY_RANK[a?.rarity] ?? 99;
  const rb = RARITY_RANK[b?.rarity] ?? 99;
  return ra - rb;
}

export function sortItemsByNameThenRarity<T>(items: T[]): T[] {
  return [...items].sort(compareItemsByNameThenRarity);
}
