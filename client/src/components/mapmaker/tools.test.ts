/**
 * The map editor's toolbar contract.
 *
 * Two things here are decisions rather than details, and both are the sort
 * that quietly get reverted: the editor opens on a tool that cannot damage the
 * map, and a single keypress only picks a tool when nothing is being typed
 * into - a map full of labels means the editor is a text editor half the time,
 * and "t" should type a t.
 */
import { describe, it, expect } from "vitest";
import { MAP_TOOLS, MAP_TOOL_DEFS, DEFAULT_MAP_TOOL, mapToolDef, toolForKey } from "./tools";

describe("the map editor's tools", () => {
  it("opens on a tool that cannot change the map", () => {
    expect(DEFAULT_MAP_TOOL).toBe("select");
    expect(mapToolDef(DEFAULT_MAP_TOOL).destructive).toBe(false);
  });

  it("describes every tool it offers", () => {
    expect(MAP_TOOL_DEFS.map((t) => t.key).sort()).toEqual([...MAP_TOOLS].sort());
    for (const def of MAP_TOOL_DEFS) {
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.hint.length).toBeGreaterThan(0);
      expect(def.shortcut).toMatch(/^[A-Z]$/);
    }
  });

  it("gives every tool its own shortcut", () => {
    const keys = MAP_TOOL_DEFS.map((t) => t.shortcut);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("picks a tool from a bare keypress", () => {
    expect(toolForKey("v")).toBe("select");
    expect(toolForKey("T")).toBe("terrain");
    expect(toolForKey("s")).toBe("stamp");
  });

  it("leaves typing alone", () => {
    expect(toolForKey("t", { typing: true })).toBeNull();
  });

  it("leaves shortcuts with a modifier alone", () => {
    // Ctrl+S is Save, not the Stamp tool.
    expect(toolForKey("s", { ctrl: true })).toBeNull();
    expect(toolForKey("s", { meta: true })).toBeNull();
    expect(toolForKey("v", { alt: true })).toBeNull();
  });

  it("ignores keys that aren't a tool", () => {
    expect(toolForKey("q")).toBeNull();
    expect(toolForKey("1")).toBeNull();
  });
});
