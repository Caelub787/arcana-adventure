/**
 * The two panels and what each is for: Sheets holds the things a table is
 * built from, Notes holds what people write. A note is never locked by Player
 * view — writing in one is playing — and everything in either list answers a
 * right-click with the same menu its buttons open.
 */
import { describe, it, expect } from "vitest";

/** What the Sheets panel is pinned to (AgCampaignPanel) and the Notes panel (AgNotesPanel). */
const SHEETS_TABS = ["characters", "abilities", "items", "beasts"];
const NOTES_TABS = ["notes"];

describe("which panel holds what", () => {
  it("keeps notes out of the Sheets panel — they have a panel of their own", () => {
    expect(SHEETS_TABS).not.toContain("notes");
    expect(NOTES_TABS).toEqual(["notes"]);
  });

  it("hides the tab row where there is only one tab", () => {
    expect(NOTES_TABS.length > 1).toBe(false);
    expect(SHEETS_TABS.length > 1).toBe(true);
  });
});

/**
 * Player view locks a sheet's page so nobody rearranges the layout mid-game.
 * A note has no layout to protect, so it stays open to whoever may edit it —
 * and a sheet the server won't let you write to is read-only either way.
 */
describe("when a page is locked", () => {
  const locked = (p: { type: string; play: boolean; readOnly?: boolean; embedded?: boolean; gmSection?: boolean }) => {
    const play = p.embedded || (p.play && !p.gmSection && p.type !== "note");
    return !!p.readOnly || play;
  };

  it("locks a character sheet in Player view", () => {
    expect(locked({ type: "character", play: true })).toBe(true);
  });

  it("leaves a note open in Player view", () => {
    expect(locked({ type: "note", play: true })).toBe(false);
  });

  it("still keeps a note read-only for someone who may not edit it", () => {
    expect(locked({ type: "note", play: true, readOnly: true })).toBe(true);
  });

  it("locks a note shown inside another sheet's page", () => {
    expect(locked({ type: "note", play: false, embedded: true })).toBe(true);
  });

  it("leaves everything open in GM view", () => {
    expect(locked({ type: "character", play: false })).toBe(false);
  });
});

/** Right-clicking the list offers what that list is for, and nothing you may not do. */
describe("the right-click menu on a list", () => {
  const listMenu = (p: { mayCreate: boolean; mayFolder: boolean; mayImport: boolean }) => [
    ...(p.mayCreate ? ["new"] : []),
    ...(p.mayFolder ? ["new-folder"] : []),
    ...(p.mayImport ? ["import"] : []),
  ];

  it("offers the GM a sheet, a folder and the library", () => {
    expect(listMenu({ mayCreate: true, mayFolder: true, mayImport: true })).toEqual(["new", "new-folder", "import"]);
  });

  it("offers a player on their notes a note and a folder for it", () => {
    expect(listMenu({ mayCreate: true, mayFolder: true, mayImport: false })).toEqual(["new", "new-folder"]);
  });

  it("offers a player nothing on a list they can't add to", () => {
    expect(listMenu({ mayCreate: false, mayFolder: false, mayImport: false })).toEqual([]);
  });
});
