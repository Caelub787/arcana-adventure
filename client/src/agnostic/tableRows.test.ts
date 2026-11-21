/**
 * The Table shows a row per player, holding the character that player plays.
 *
 * It used to show every sheet that had an owner. A player owns their traits,
 * their items and their wounds as well as their character, so the Table
 * filled up with them — a trait called Sandwich Addiction sat in the list
 * with three token slots beside it.
 */
import { describe, it, expect } from "vitest";
import { tableRows } from "./AgTable";

const note = (name: string, type: string, ownerIds: string[] = [], extra: any = {}) =>
  ({ id: name, name, type, ownerIds, isTemplate: false, ...extra }) as any;
const member = (userId: string, name: string, role = "player") => ({ userId, name, role });

const ALICE = member("u_alice", "Alice");
const BOB = member("u_bob", "Bob");
const GM = member("u_gm", "The GM", "gm");

describe("tableRows", () => {
  it("gives a player the character they own", () => {
    const rows = tableRows([note("Austin", "character", ["u_alice"])], [ALICE]);
    expect(rows).toHaveLength(1);
    expect(rows[0].note?.name).toBe("Austin");
    expect(rows[0].member.name).toBe("Alice");
  });

  it("leaves out the other things a player owns", () => {
    const rows = tableRows([
      note("Austin", "character", ["u_alice"]),
      note("Sandwich Addiction", "trait", ["u_alice"]),
      note("Rusty Sword", "item", ["u_alice"]),
      note("Goblin arrow", "wound", ["u_alice"]),
    ], [ALICE]);
    expect(rows.map((r) => r.note?.name)).toEqual(["Austin"]);
  });

  it("leaves out templates", () => {
    const rows = tableRows([note("CA Character", "character", ["u_alice"], { isTemplate: true })], [ALICE]);
    expect(rows[0].note).toBeNull();
  });

  it("leaves out a character nobody plays", () => {
    const rows = tableRows([note("Some NPC", "character", [])], [ALICE]);
    expect(rows[0].note).toBeNull();
  });

  it("gives a player with no character a row anyway, so they aren't silently missing", () => {
    const rows = tableRows([], [ALICE]);
    expect(rows).toHaveLength(1);
    expect(rows[0].member.name).toBe("Alice");
    expect(rows[0].note).toBeNull();
  });

  it("picks the first by name when a player owns two", () => {
    const rows = tableRows([
      note("Zara", "character", ["u_alice"]),
      note("Austin", "character", ["u_alice"]),
    ], [ALICE]);
    expect(rows[0].note?.name).toBe("Austin");
  });

  it("gives the GM no row of their own", () => {
    const rows = tableRows([note("GM's guy", "character", ["u_gm"])], [GM, ALICE]);
    expect(rows.map((r) => r.member.name)).toEqual(["Alice"]);
  });

  it("gives one row per player even when they share a sheet", () => {
    const rows = tableRows([note("The Party", "character", ["u_alice", "u_bob"])], [ALICE, BOB]);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.note?.name === "The Party")).toBe(true);
  });
});
