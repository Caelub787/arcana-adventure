/**
 * Who plays a sheet.
 *
 * A sheet is assigned to people — the GM included, since a GM plays characters
 * too — and whoever it's assigned to moves its token on the map, changes its
 * values and presses its buttons. The map and the server both ask this same
 * question, so a player's own character never walks back to where it started.
 */
import { describe, it, expect } from "vitest";
import { mayPlayNote } from "./acl";
import { findMyToken } from "./tokens";

const sheet = (ownerIds: string[], userIds?: string[]) => ({ ownerIds, userIds });

describe("who may play a sheet", () => {
  it("lets whoever it's assigned to play it", () => {
    expect(mayPlayNote(sheet(["aria"]), "aria")).toBe(true);
  });

  it("lets a GM assign one to themselves", () => {
    expect(mayPlayNote(sheet(["gm"]), "gm")).toBe(true);
  });

  it("lets more than one person share it", () => {
    expect(mayPlayNote(sheet(["aria", "bram"]), "bram")).toBe(true);
  });

  it("lets someone carrying it use it — an item lent to them", () => {
    expect(mayPlayNote(sheet(["aria"], ["bram"]), "bram")).toBe(true);
  });

  it("says no to anyone else", () => {
    expect(mayPlayNote(sheet(["aria"]), "bram")).toBe(false);
  });

  it("says no for a sheet nobody has been given — a monster is the GM's", () => {
    expect(mayPlayNote(sheet([]), "aria")).toBe(false);
  });

  it("says no when there's nobody asking", () => {
    expect(mayPlayNote(sheet(["aria"]), null)).toBe(false);
    expect(mayPlayNote(sheet(["aria"]), "")).toBe(false);
  });
});

/**
 * And which token on the map is yours. The camera, the fog and the ruler all
 * ask this, so if it comes back empty the camera button greys out and a cone
 * has nothing to measure from — which is exactly what happened on an Agnostic
 * table, where there are no character records to find.
 */
describe("my token on the map", () => {
  const notes: Record<string, { ownerIds: string[]; userIds?: string[] }> = {
    hero: { ownerIds: ["aria"] },
    wolf: { ownerIds: [] },
    lantern: { ownerIds: ["gm"], userIds: ["bram"] },
  };
  const noteOf = (id: string) => notes[id];
  const map = [
    { id: "t1", characterId: null, agnosticNoteId: "wolf" },
    { id: "t2", characterId: null, agnosticNoteId: "hero" },
    { id: "t3", characterId: "char-7", agnosticNoteId: null },
  ];

  it("finds the token of a sheet assigned to me", () => {
    expect(findMyToken(map, { userId: "aria", noteOf })?.id).toBe("t2");
  });

  it("finds one assigned to the GM, who plays characters too", () => {
    const gmMap = [{ id: "t9", characterId: null, agnosticNoteId: "lantern" }];
    expect(findMyToken(gmMap, { userId: "gm", noteOf })?.id).toBe("t9");
  });

  it("finds the one lent to someone — it's theirs to carry", () => {
    const lent = [{ id: "t9", characterId: null, agnosticNoteId: "lantern" }];
    expect(findMyToken(lent, { userId: "bram", noteOf })?.id).toBe("t9");
  });

  it("still prefers the character assigned to me in the older systems", () => {
    expect(findMyToken(map, { characterId: "char-7", userId: "aria", noteOf })?.id).toBe("t3");
  });

  it("finds nothing for someone with no token out", () => {
    expect(findMyToken(map, { userId: "nobody", noteOf })).toBeNull();
  });

  it("finds nothing where there are no sheets to ask — no crash, just none", () => {
    expect(findMyToken(map, { userId: "aria" })).toBeNull();
  });

  it("doesn't hand someone a monster nobody is assigned", () => {
    expect(findMyToken([map[0]], { userId: "aria", noteOf })).toBeNull();
  });
});
