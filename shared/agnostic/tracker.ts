/**
 * The player tracker: the row of cards the table watches.
 *
 * Pinning a sheet to the tracker is the GM saying "everybody sees this one".
 * The whole table gets the card — the name, the portrait and the values the
 * card shows — whether or not they'd otherwise be allowed near the sheet.
 * Nothing else comes with it: they can't open it, change it, or see a value
 * the card doesn't show. The rules for that live here so the server and the
 * screen agree on exactly what a card is.
 */
import type { AgCampaignSettings, AgComponentDef, AgLayout, AgTrackerCard } from "./types";
import { DEFAULT_TRACKER_CARD } from "./types";

/** Which card a sheet wears: its own, its kind's, or the first one going. */
export function cardForNote(settings: AgCampaignSettings, noteId: string, type: string): AgTrackerCard {
  const t = settings.tracker;
  const id = t.cardByNote[noteId] ?? t.cardByType[type];
  return t.cards.find((c) => c.id === id) ?? t.cards[0] ?? DEFAULT_TRACKER_CARD;
}

/**
 * Every value a card shows, by key. Values on *other* sheets (a path like
 * "weapon.damage") are left out on purpose: a card can't be a window into a
 * sheet nobody said to share.
 */
export function trackerRefs(card: AgTrackerCard, componentOf?: (id: string) => AgComponentDef | undefined | null): string[] {
  const out = new Set<string>();
  const add = (ref: unknown, bindings?: Record<string, string>) => {
    let r = typeof ref === "string" ? ref.trim() : "";
    if (!r) return;
    if (r.startsWith("$")) r = (bindings?.[r.slice(1)] ?? r.slice(1)).trim();
    if (!r || r.includes(".") || r.startsWith("$")) return;
    out.add(r);
  };
  const walk = (layout: AgLayout, bindings?: Record<string, string>, depth = 0) => {
    if (depth > 4) return; // a component inside a component inside…
    for (const item of layout.items ?? []) {
      const w: any = item.widget;
      if (!w) continue;
      if (w.kind === "field") { add(w.ref, bindings); add(w.maxRef, bindings); }
      else if (w.kind === "image") add(w.ref, bindings);
      else if (w.kind === "chart") { for (const r of w.refs ?? []) add(r, bindings); add(w.maxRef, bindings); }
      else if (w.kind === "component") {
        const def = componentOf?.(w.componentId);
        if (def) walk(def.layout, w.bindings ?? {}, depth + 1);
      }
    }
  };
  walk(card.layout);
  return [...Array.from(out)];
}

/** The sheets on the tracker, in the order the GM put them. */
export const trackerPinned = (settings: AgCampaignSettings | null | undefined): string[] => settings?.tracker.pinned ?? [];

/**
 * Dragging one card onto another. Dropping it on something further along the
 * row puts it after that one, dropping it back up the row puts it before —
 * which is what a hand expects of a row of cards.
 */
export function reorderPinned(pinned: readonly string[], fromId: string, toId: string): string[] {
  const from = pinned.indexOf(fromId), to = pinned.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return [...pinned];
  const rest = pinned.filter((x) => x !== fromId);
  const at = rest.indexOf(toId) + (from < to ? 1 : 0);
  return [...rest.slice(0, at), fromId, ...rest.slice(at)];
}

/** One step along the row, the way the menu moves them. */
export function nudgePinned(pinned: readonly string[], id: string, step: -1 | 1): string[] {
  const p = [...pinned];
  const i = p.indexOf(id), j = i + step;
  if (i < 0 || j < 0 || j >= p.length) return p;
  [p[i], p[j]] = [p[j], p[i]];
  return p;
}
