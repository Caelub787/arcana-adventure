import { describe, it, expect } from "vitest";
import { rollsForTracked } from "../GameComponents";
import type { PinnedRollFeedEntry } from "../GameComponents";

const entry = (over: Partial<PinnedRollFeedEntry>): PinnedRollFeedEntry => ({
  id: Math.random().toString(36).slice(2),
  username: "someone",
  text: "D20",
  total: 12,
  ts: Date.now(),
  ...over,
});

describe("rollsForTracked", () => {
  it("matches on the roller's user id", () => {
    const feed = [
      entry({ userId: "u1", username: "Reed" }),
      entry({ userId: "u2", username: "Sam" }),
    ];
    expect(rollsForTracked(feed, { userId: "u1" })).toHaveLength(1);
  });

  // The whole reason userId is preferred: some paths swap the username for a
  // per-campaign nickname, which used to drop the roll from the tracker.
  it("still matches when the display name has been swapped for a nickname", () => {
    const feed = [entry({ userId: "u1", username: "TheDungeonBoss" })];
    expect(rollsForTracked(feed, { userId: "u1", username: "Reed" })).toHaveLength(1);
  });

  it("matches a character's own rolls, including system-attributed ones", () => {
    const feed = [
      entry({ username: "System", characterName: "Mara", text: "Burning" }),
      entry({ userId: "u9", username: "Sam", characterName: "Grix" }),
    ];
    const mara = rollsForTracked(feed, { characterName: "Mara" });
    expect(mara).toHaveLength(1);
    expect(mara[0].text).toBe("Burning");
  });

  it("falls back to the username for older rows with no userId", () => {
    const feed = [entry({ username: "Reed" })];
    expect(rollsForTracked(feed, { userId: "u1", username: "Reed" })).toHaveLength(1);
  });

  it("picks up a player's roll and their character's roll under one card", () => {
    const feed = [
      entry({ userId: "u1", username: "Reed", text: "D20 raw" }),
      entry({ username: "System", characterName: "Mara", text: "Poison" }),
      entry({ userId: "u2", username: "Sam", characterName: "Grix" }),
    ];
    const mine = rollsForTracked(feed, { userId: "u1", username: "Reed", characterName: "Mara" });
    expect(mine.map((r) => r.text).sort()).toEqual(["D20 raw", "Poison"]);
  });

  it("does not claim someone else's rolls", () => {
    const feed = [entry({ userId: "u2", username: "Sam", characterName: "Grix" })];
    expect(rollsForTracked(feed, { userId: "u1", username: "Reed", characterName: "Mara" })).toHaveLength(0);
  });

  it("ignores blank targets rather than matching everything", () => {
    const feed = [entry({ username: "Reed" }), entry({ characterName: "Mara" })];
    expect(rollsForTracked(feed, {})).toHaveLength(0);
    expect(rollsForTracked(feed, { userId: undefined, username: undefined })).toHaveLength(0);
  });

  it("survives an empty feed", () => {
    expect(rollsForTracked([], { userId: "u1" })).toEqual([]);
  });
});
