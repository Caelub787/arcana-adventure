/** Folders are paths on the sheets themselves — these are the rules for them. */
import { describe, it, expect } from "vitest";
import {
  buildFolderTree, canMoveFolder, childFolder, cleanFolderName, countIn, flattenFolders,
  folderName, inFolder, movedFolder, normalizeFolder, parentFolder, parseTabFolder, tabFolderKey,
} from "./folders";

const note = (name: string, folder: string | null) => ({ name, folder });

describe("reading a path", () => {
  it("takes the folder's name off the end", () => {
    expect(folderName("Weapons/Templates")).toBe("Templates");
    expect(folderName("Weapons")).toBe("Weapons");
  });

  it("knows what a folder sits in", () => {
    expect(parentFolder("Weapons/Templates")).toBe("Weapons");
    expect(parentFolder("Weapons")).toBe("");
  });

  it("tidies stray slashes and spaces away", () => {
    expect(normalizeFolder("  Weapons //  Templates ")).toBe("Weapons/Templates");
    expect(normalizeFolder(null)).toBe("");
  });

  it("makes a folder inside another", () => {
    expect(childFolder("Weapons", "Templates")).toBe("Weapons/Templates");
    expect(childFolder("", "Weapons")).toBe("Weapons");
  });
});

describe("what counts as being in a folder", () => {
  it("counts the folder itself and everything under it", () => {
    expect(inFolder("Weapons", "Weapons")).toBe(true);
    expect(inFolder("Weapons/Templates", "Weapons")).toBe(true);
    expect(inFolder("Weapons/Templates/Old", "Weapons")).toBe(true);
  });

  it("doesn't count a folder that merely starts the same way", () => {
    expect(inFolder("Weaponsmithing", "Weapons")).toBe(false);
  });

  it("counts everything as being at the top", () => {
    expect(inFolder("Weapons", "")).toBe(true);
    expect(inFolder(null, "")).toBe(true);
  });
});

describe("moving a folder", () => {
  it("carries everything under it along", () => {
    expect(movedFolder("Weapons/Templates", "Weapons", "Gear/Weapons")).toBe("Gear/Weapons/Templates");
    expect(movedFolder("Weapons", "Weapons", "Gear/Weapons")).toBe("Gear/Weapons");
  });

  it("leaves other folders where they are", () => {
    expect(movedFolder("Armor", "Weapons", "Gear/Weapons")).toBe("Armor");
  });

  it("takes one out to the top", () => {
    expect(movedFolder("Gear/Weapons/Old", "Gear/Weapons", "Weapons")).toBe("Weapons/Old");
  });

  it("refuses to put a folder inside itself", () => {
    expect(canMoveFolder("Weapons", "Weapons")).toBe(false);
    expect(canMoveFolder("Weapons", "Weapons/Templates")).toBe(false);
  });

  it("refuses a move that changes nothing", () => {
    expect(canMoveFolder("Gear/Weapons", "Gear")).toBe(false);
  });

  it("allows a real move", () => {
    expect(canMoveFolder("Weapons", "Gear")).toBe(true);
    expect(canMoveFolder("Gear/Weapons", "")).toBe(true);
  });
});

describe("naming a folder", () => {
  it("won't let a typed name make two folders", () => {
    expect(cleanFolderName("Weapons/Templates")).toBe("Weapons Templates");
  });

  it("trims it", () => {
    expect(cleanFolderName("  Weapons  ")).toBe("Weapons");
  });
});

describe("the tree a tab shows", () => {
  const notes = [
    note("Sword", "Weapons"),
    note("Axe", "Weapons"),
    note("Weapon", "Weapons/Templates"),
    note("Loose Scroll", null),
    note("Helm", "Armor"),
  ];

  it("files everything where it says it is", () => {
    const root = buildFolderTree(notes);
    expect(root.items.map((n) => n.name)).toEqual(["Loose Scroll"]);
    expect(root.folders.map((f) => f.name)).toEqual(["Armor", "Weapons"]);
    const weapons = root.folders.find((f) => f.name === "Weapons")!;
    expect(weapons.items.map((n) => n.name)).toEqual(["Sword", "Axe"]);
    expect(weapons.folders.map((f) => f.name)).toEqual(["Templates"]);
    expect(weapons.folders[0].items.map((n) => n.name)).toEqual(["Weapon"]);
  });

  it("makes the folders in between even when nothing is filed in them", () => {
    const root = buildFolderTree([note("Weapon", "Gear/Weapons/Templates")]);
    expect(root.folders[0].name).toBe("Gear");
    expect(root.folders[0].folders[0].name).toBe("Weapons");
  });

  it("keeps a folder someone made but hasn't filled yet", () => {
    const root = buildFolderTree([note("Sword", "Weapons")], ["Armor", "Weapons/Templates"]);
    expect(flattenFolders(root).map((f) => f.path).sort()).toEqual(["Armor", "Weapons", "Weapons/Templates"]);
  });

  it("counts everything under a folder, not just its own row", () => {
    const root = buildFolderTree(notes);
    expect(countIn(root.folders.find((f) => f.name === "Weapons")!)).toBe(3);
    expect(countIn(root)).toBe(5);
  });
});

describe("an empty folder waiting to be filled", () => {
  it("remembers which tab it was made on", () => {
    expect(tabFolderKey("items", "Weapons/Templates")).toBe("items::Weapons/Templates");
    expect(parseTabFolder("items::Weapons/Templates")).toEqual({ tab: "items", path: "Weapons/Templates" });
  });

  it("ignores anything that isn't one", () => {
    expect(parseTabFolder("Weapons")).toBeNull();
    expect(parseTabFolder("::Weapons")).toBeNull();
    expect(parseTabFolder("items::")).toBeNull();
  });
});
