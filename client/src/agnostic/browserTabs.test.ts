/**
 * The sheet browser used to be one list with a row of type chips. A table
 * reaches for characters, items, beasts and notes, so each of those gets a tab
 * and Items takes everything else — a blueprint or a recipe is a thing like
 * any other thing. Inside a tab it is folders, so there are no chips left.
 */
import { describe, it, expect } from "vitest";
import { AG_BUILTIN_TYPES } from "@shared/agnostic/types";

const TAB_TYPES: Record<string, string[]> = {
  characters: ["character", "npc", "species"],
  abilities: ["ability", "aspect"],
  beasts: ["beast"],
  notes: ["note", "location"],
};
const ALL = AG_BUILTIN_TYPES.map((t) => t.id);
const tabOf = (type: string) => Object.keys(TAB_TYPES).find((k) => TAB_TYPES[k].includes(type)) ?? "items";
const typesOf = (tab: string, all: string[] = ALL) => all.filter((t) => tabOf(t) === tab);

describe("which sheets each tab holds", () => {
  it("keeps the people together: characters, NPCs and species", () => {
    expect(typesOf("characters")).toEqual(["character", "npc", "species"]);
  });

  it("gives beasts and notes their own tab", () => {
    expect(typesOf("beasts")).toEqual(["beast"]);
    expect(typesOf("notes")).toContain("note");
  });

  it("puts blueprints and recipes in with the items", () => {
    for (const t of ["item", "blueprint", "recipe", "rune_recipe", "craft", "experiment"]) {
      expect(tabOf(t)).toBe("items");
    }
  });

  it("sends a kind a GM invents to Items rather than nowhere", () => {
    expect(tabOf("spell")).toBe("items");
  });

  it("leaves nothing out: every kind lands on exactly one tab", () => {
    const covered = ["characters", "abilities", "items", "beasts", "notes"].flatMap((t) => typesOf(t));
    expect([...covered].sort()).toEqual([...ALL].sort());
  });

  it("only offers a tab that has something it could hold", () => {
    const library = ["character", "npc", "beast", "item", "species"];
    const offered = ["characters", "abilities", "items", "beasts", "notes"].filter((t) => typesOf(t, library).length > 0);
    expect(offered).toEqual(["characters", "items", "beasts"]);
  });

  it("gives abilities and their aspects a tab of their own, away from the items", () => {
    expect(tabOf("ability")).toBe("abilities");
    expect(tabOf("aspect")).toBe("abilities");
    expect(typesOf("items", ["item", "ability", "aspect", "blueprint"])).toEqual(["item", "blueprint"]);
  });
});

/**
 * A beast put on the table is a copy that belongs to its token: it can be
 * wounded and killed on its own. The browser leaves those out, so the only
 * beast anyone can pick up is the original with its own stats — not one
 * already halfway through a fight.
 */
describe("beasts standing on the table", () => {
  const shown = (notes: Array<{ name: string; spawnedFrom?: string | null }>) => notes.filter((n) => !n.spawnedFrom).map((n) => n.name);

  it("keeps the copies out of the list", () => {
    expect(shown([
      { name: "Dire Wolf" },
      { name: "Dire Wolf 1", spawnedFrom: "w" },
      { name: "Dire Wolf 2", spawnedFrom: "w" },
    ])).toEqual(["Dire Wolf"]);
  });

  it("leaves the sheet they came off right where it is", () => {
    expect(shown([{ name: "Dire Wolf", spawnedFrom: null }])).toEqual(["Dire Wolf"]);
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

/**
 * Notes are the one thing a player makes for themselves, so the New button
 * stays on the Notes tab whichever view they're in. Everything else a
 * campaign is built out of is still the GM's.
 */
describe("who may press New", () => {
  const mayCreate = (tab: string, isGM: boolean) => isGM || tab === "notes";

  it("lets a player start a note of their own", () => {
    expect(mayCreate("notes", false)).toBe(true);
  });

  it("does not let a player make characters or items", () => {
    for (const tab of ["characters", "items", "more", "templates"]) {
      expect(mayCreate(tab, false)).toBe(false);
    }
  });

  it("leaves the GM able to make anything", () => {
    for (const tab of ["characters", "items", "notes", "more", "templates"]) {
      expect(mayCreate(tab, true)).toBe(true);
    }
  });
});

/** A panel pinned to one tab has nothing to choose, so the row is hidden. */
describe("the tab row", () => {
  const shows = (tabs: string[]) => tabs.length > 1;

  it("is hidden when the panel is pinned to a single tab", () => {
    expect(shows(["notes"])).toBe(false);
  });

  it("shows when there is more than one tab", () => {
    expect(shows(["characters", "items", "beasts", "notes"])).toBe(true);
  });
});
