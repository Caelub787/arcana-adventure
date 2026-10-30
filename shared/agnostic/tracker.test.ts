/**
 * The player tracker. Pinning a sheet to it shows the whole table that card —
 * name, portrait and the values the card itself shows, and nothing else — and
 * the GM decides the order they sit in.
 */
import { describe, it, expect } from "vitest";
import { cardForNote, reorderPinned, nudgePinned, trackerRefs } from "./tracker";
import type { AgCampaignSettings, AgTrackerCard } from "./types";
import { defaultCampaignSettings } from "./types";

const card = (id: string, items: any[] = []): AgTrackerCard => ({ id, name: id, layout: { width: 200, height: 80, items } });
const settings = (over: Partial<AgCampaignSettings["tracker"]>): AgCampaignSettings => {
  const d = defaultCampaignSettings();
  return { ...d, tracker: { ...d.tracker, ...over } };
};

describe("which card a sheet wears", () => {
  const a = card("a"), b = card("b");
  it("takes the one set for that sheet", () => {
    expect(cardForNote(settings({ cards: [a, b], cardByNote: { n1: "b" }, cardByType: { character: "a" } }), "n1", "character").id).toBe("b");
  });

  it("falls back to the one set for its kind", () => {
    expect(cardForNote(settings({ cards: [a, b], cardByNote: {}, cardByType: { character: "b" } }), "n1", "character").id).toBe("b");
  });

  it("falls back again to the first card going", () => {
    expect(cardForNote(settings({ cards: [a, b], cardByNote: {}, cardByType: {} }), "n1", "beast").id).toBe("a");
  });
});

describe("what a card shows", () => {
  const hp = { id: "hp", x: 0, y: 0, w: 10, h: 10, widget: { kind: "field", ref: "hp", maxRef: "hp_max", display: "bar" } };
  const rank = { id: "r", x: 0, y: 0, w: 10, h: 10, widget: { kind: "field", ref: "rank", display: "value" } };
  const face = { id: "p", x: 0, y: 0, w: 10, h: 10, widget: { kind: "portrait" } };

  it("is the values on it, and only those", () => {
    expect(trackerRefs(card("c", [face, hp, rank])).sort()).toEqual(["hp", "hp_max", "rank"]);
  });

  it("counts nothing for a card of pictures and words", () => {
    expect(trackerRefs(card("c", [face, { id: "t", x: 0, y: 0, w: 1, h: 1, widget: { kind: "text", text: "Hi" } }]))).toEqual([]);
  });

  it("never reaches onto another sheet", () => {
    const borrowed = { id: "b", x: 0, y: 0, w: 1, h: 1, widget: { kind: "field", ref: "weapon.damage", display: "value" } };
    expect(trackerRefs(card("c", [borrowed]))).toEqual([]);
  });

  it("follows a component to the values it ends up showing", () => {
    const comp: any = { id: "bar", scope: "campaign", scopeId: "x", name: "HP bar", params: ["value", "max"], updatedAt: 0,
      layout: { width: 100, height: 20, items: [{ id: "v", x: 0, y: 0, w: 1, h: 1, widget: { kind: "field", ref: "$value", maxRef: "$max", display: "bar" } }] } };
    const used = { id: "c1", x: 0, y: 0, w: 1, h: 1, widget: { kind: "component", componentId: "bar", bindings: { value: "wounds", max: "wounds_max" } } };
    expect(trackerRefs(card("c", [used]), () => comp).sort()).toEqual(["wounds", "wounds_max"]);
  });

  it("lets an unbound parameter fall back to the sheet's own value of that name", () => {
    const comp: any = { id: "bar", scope: "campaign", scopeId: "x", name: "HP bar", params: ["hp"], updatedAt: 0,
      layout: { width: 100, height: 20, items: [{ id: "v", x: 0, y: 0, w: 1, h: 1, widget: { kind: "field", ref: "$hp", display: "bar" } }] } };
    const used = { id: "c1", x: 0, y: 0, w: 1, h: 1, widget: { kind: "component", componentId: "bar", bindings: {} } };
    expect(trackerRefs(card("c", [used]), () => comp)).toEqual(["hp"]);
  });
});

describe("the order the GM puts them in", () => {
  const row = ["a", "b", "c", "d"];

  it("drops one further along the row after what it landed on", () => {
    expect(reorderPinned(row, "a", "c")).toEqual(["b", "c", "a", "d"]);
  });

  it("drops one back up the row before what it landed on", () => {
    expect(reorderPinned(row, "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("swaps two side by side, either way round", () => {
    expect(reorderPinned(row, "a", "b")).toEqual(["b", "a", "c", "d"]);
    expect(reorderPinned(row, "b", "a")).toEqual(["b", "a", "c", "d"]);
  });

  it("leaves the row alone when a card is dropped on itself", () => {
    expect(reorderPinned(row, "c", "c")).toEqual(row);
  });

  it("steps one along at a time from the menu", () => {
    expect(nudgePinned(row, "c", -1)).toEqual(["a", "c", "b", "d"]);
    expect(nudgePinned(row, "c", 1)).toEqual(["a", "b", "d", "c"]);
  });

  it("won't step the first one earlier or the last one later", () => {
    expect(nudgePinned(row, "a", -1)).toEqual(row);
    expect(nudgePinned(row, "d", 1)).toEqual(row);
  });
});
