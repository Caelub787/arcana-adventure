/**
 * The sheet browser used to be one list with a row of type chips. A table
 * reaches for characters, items and notes constantly and everything else
 * rarely, so those three get a tab each and the rest share "More" — where the
 * chips still are, because there it is still a list of several kinds.
 */
import { describe, it, expect } from "vitest";
import { AG_BUILTIN_TYPES } from "@shared/agnostic/types";

const TAB_TYPES: Record<string, string[]> = {
  characters: ["character", "npc", "beast"],
  items: ["item"],
  notes: ["note"],
};
const ALL = AG_BUILTIN_TYPES.map((t) => t.id);
const typesOf = (tab: string, all = ALL) => {
  if (tab === "more") { const taken = new Set(Object.values(TAB_TYPES).flat()); return all.filter((t) => !taken.has(t)); }
  return TAB_TYPES[tab] ?? all;
};
const chipsFor = (tab: string, all = ALL) => (typesOf(tab, all).length > 1 ? typesOf(tab, all) : []);

describe("which sheets each tab holds", () => {
  it("puts characters, NPCs and beasts together — they are all people on the table", () => {
    expect(typesOf("characters")).toEqual(["character", "npc", "beast"]);
  });

  it("gives items and notes a tab of their own", () => {
    expect(typesOf("items")).toEqual(["item"]);
    expect(typesOf("notes")).toEqual(["note"]);
  });

  it("sweeps everything else into More, and leaves nothing out", () => {
    const covered = [...typesOf("characters"), ...typesOf("items"), ...typesOf("notes"), ...typesOf("more")];
    expect([...covered].sort()).toEqual([...ALL].sort());
  });

  it("keeps the crafting kinds out of the three main tabs", () => {
    for (const t of ["blueprint", "recipe", "rune_recipe", "craft", "experiment"]) {
      expect(typesOf("more")).toContain(t);
      expect(typesOf("characters")).not.toContain(t);
    }
  });

  it("shows chips only where there is a choice to make", () => {
    expect(chipsFor("items")).toEqual([]);
    expect(chipsFor("notes")).toEqual([]);
    expect(chipsFor("characters").length).toBeGreaterThan(1);
    expect(chipsFor("more").length).toBeGreaterThan(1);
  });

  it("takes in a kind the GM invented, on the More tab", () => {
    const withCustom = [...ALL, "faction"];
    expect(typesOf("more", withCustom)).toContain("faction");
  });

  it("drops a chip that the tab you moved to doesn't have", () => {
    // Filtering by NPCs and then moving to Items would otherwise show nothing.
    const keep = (tab: string, chip: string) => (chipsFor(tab).includes(chip) ? chip : "");
    expect(keep("items", "npc")).toBe("");
    expect(keep("characters", "npc")).toBe("npc");
  });
});

describe("naming one of a kind of creature", () => {
  /** "Wolf 3": the next free number among the ones already out. */
  const next = (names: string[], source: string) => {
    const taken = new Set<number>();
    for (const n of names) {
      const m = n.match(new RegExp(`^${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} (\\d+)$`));
      if (m) taken.add(Number(m[1]));
    }
    let i = 1;
    while (taken.has(i)) i++;
    return `${source} ${i}`;
  };

  it("starts at one", () => {
    expect(next(["Dire Wolf"], "Dire Wolf")).toBe("Dire Wolf 1");
  });

  it("counts up as more are put out", () => {
    expect(next(["Dire Wolf", "Dire Wolf 1", "Dire Wolf 2"], "Dire Wolf")).toBe("Dire Wolf 3");
  });

  it("fills a gap left by one that was killed", () => {
    expect(next(["Dire Wolf 1", "Dire Wolf 3"], "Dire Wolf")).toBe("Dire Wolf 2");
  });

  it("counts its own kind only", () => {
    expect(next(["Goblin 1", "Goblin 2", "Dire Wolf 1"], "Dire Wolf")).toBe("Dire Wolf 2");
  });

  it("is not confused by a name with regex characters in it", () => {
    expect(next(["Wolf (Alpha) 1"], "Wolf (Alpha)")).toBe("Wolf (Alpha) 2");
  });
});
