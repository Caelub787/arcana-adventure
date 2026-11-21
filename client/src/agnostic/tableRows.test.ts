/**
 * The Table shows a row per player, holding the sheet that player is playing.
 *
 * It used to read this off edit access, which listed every sheet a player
 * owned — their traits, their items and their wounds as well as their
 * character. A trait called Sandwich Addiction sat in the list with three
 * token slots beside it. Playing a sheet is its own thing now, and one at a
 * time, so there is exactly one answer per player.
 */
import { describe, it, expect } from "vitest";
import { tableRows } from "./AgTable";

const note = (id: string, name: string, type: string, ownerIds: string[] = [], extra: any = {}) =>
  ({ id, name, type, ownerIds, isTemplate: false, ...extra }) as any;
const member = (userId: string, name: string, role = "player") => ({ userId, name, role });
const settings = (assigned: Record<string, string>) => ({ assigned }) as any;

const ALICE = member("u_alice", "Alice");
const BOB = member("u_bob", "Bob");
const GM = member("u_gm", "The GM", "gm");

const AUSTIN = note("n_austin", "Austin", "character", ["u_alice"]);
const ZARA = note("n_zara", "Zara", "character", ["u_alice"]);
const SANDWICH = note("n_sand", "Sandwich Addiction", "trait", ["u_alice"]);

describe("tableRows", () => {
  it("gives a player the sheet they are playing", () => {
    const rows = tableRows([AUSTIN], [ALICE], settings({ u_alice: "n_austin" }));
    expect(rows).toHaveLength(1);
    expect(rows[0].note?.name).toBe("Austin");
    expect(rows[0].member.name).toBe("Alice");
  });

  it("ignores the other things a player can edit", () => {
    const rows = tableRows([AUSTIN, SANDWICH, ZARA], [ALICE], settings({ u_alice: "n_austin" }));
    expect(rows.map((r) => r.note?.name)).toEqual(["Austin"]);
  });

  it("will not hand someone a trait even if that is what they are assigned", () => {
    // Nothing should assign a trait, but if something did it is still one row.
    const rows = tableRows([AUSTIN, SANDWICH], [ALICE], settings({ u_alice: "n_sand" }));
    expect(rows).toHaveLength(1);
    expect(rows[0].note?.name).toBe("Sandwich Addiction");
  });

  it("gives a player who is playing nothing a row anyway", () => {
    const rows = tableRows([AUSTIN], [ALICE], settings({}));
    expect(rows).toHaveLength(1);
    expect(rows[0].note).toBeNull();
  });

  it("owning a sheet is not playing it", () => {
    const rows = tableRows([AUSTIN], [ALICE], settings({}));
    expect(rows[0].note).toBeNull();
  });

  it("follows the player when they move to another sheet", () => {
    const before = tableRows([AUSTIN, ZARA], [ALICE], settings({ u_alice: "n_austin" }));
    const after = tableRows([AUSTIN, ZARA], [ALICE], settings({ u_alice: "n_zara" }));
    expect(before[0].note?.name).toBe("Austin");
    expect(after[0].note?.name).toBe("Zara");
  });

  it("gives the GM no row of their own", () => {
    const rows = tableRows([AUSTIN], [GM, ALICE], settings({ u_gm: "n_austin", u_alice: "n_austin" }));
    expect(rows.map((r) => r.member.name)).toEqual(["Alice"]);
  });

  it("lets two players share one sheet", () => {
    const rows = tableRows([AUSTIN], [ALICE, BOB], settings({ u_alice: "n_austin", u_bob: "n_austin" }));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.note?.name === "Austin")).toBe(true);
  });

  it("shows nothing for a sheet that has since been deleted", () => {
    const rows = tableRows([], [ALICE], settings({ u_alice: "n_gone" }));
    expect(rows[0].note).toBeNull();
  });

  it("copes with a campaign that has no assignments at all", () => {
    expect(tableRows([AUSTIN], [ALICE], null)[0].note).toBeNull();
    expect(tableRows([AUSTIN], [ALICE], undefined)[0].note).toBeNull();
  });
});
