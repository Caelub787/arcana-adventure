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
