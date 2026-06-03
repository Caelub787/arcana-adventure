import { describe, it, expect } from "vitest";
import { containsProfanity, censorName, displaySpellName } from "../profanity";

describe("containsProfanity", () => {
  it("returns false for empty / nullish input", () => {
    expect(containsProfanity("")).toBe(false);
    expect(containsProfanity(null)).toBe(false);
    expect(containsProfanity(undefined)).toBe(false);
  });

  it("detects a profane whole word regardless of case", () => {
    expect(containsProfanity("Damn Bolt")).toBe(true);
    expect(containsProfanity("DAMN")).toBe(true);
    expect(containsProfanity("a shit storm")).toBe(true);
  });

  it("returns false for clean names", () => {
    expect(containsProfanity("Fireball")).toBe(false);
    expect(containsProfanity("Healing Light")).toBe(false);
  });

  // Scunthorpe problem: substrings must NOT trigger a match.
  it("does not flag profanity embedded inside a larger word", () => {
    expect(containsProfanity("class")).toBe(false); // contains "ass"
    expect(containsProfanity("classic")).toBe(false);
    expect(containsProfanity("hellfire")).toBe(false); // contains "hell"
    expect(containsProfanity("Hellfire")).toBe(false);
    expect(containsProfanity("assassin")).toBe(false);
    expect(containsProfanity("Scunthorpe")).toBe(false); // contains "cun"
    expect(containsProfanity("grass")).toBe(false);
    expect(containsProfanity("password")).toBe(false);
    expect(containsProfanity("shitake")).toBe(false); // not exactly "shit"
  });

  it("flags the standalone word even next to punctuation", () => {
    expect(containsProfanity("hell!")).toBe(true);
    expect(containsProfanity("(damn)")).toBe(true);
    expect(containsProfanity("what the hell?")).toBe(true);
  });
});

describe("censorName", () => {
  it("returns empty string for nullish input", () => {
    expect(censorName(null)).toBe("");
    expect(censorName(undefined)).toBe("");
    expect(censorName("")).toBe("");
  });

  it("leaves clean names untouched", () => {
    expect(censorName("Fireball")).toBe("Fireball");
    expect(censorName("Healing Light")).toBe("Healing Light");
  });

  it("substitutes a PG word wrapped in asterisks, preserving the rest", () => {
    expect(censorName("Damn Bolt")).toBe("*darn* Bolt");
    expect(censorName("Shit Storm")).toBe("*poop* Storm");
    expect(censorName("Holy Fuck")).toBe("Holy *frick*");
  });

  it("masks a profane word that has no PG substitute (first letter + asterisks)", () => {
    expect(censorName("Cock Ring")).toBe("C*** Ring");
    expect(censorName("cunt")).toBe("c***");
  });

  it("censors multiple offending words in one name", () => {
    expect(censorName("Damn Shit Show")).toBe("*darn* *poop* Show");
  });

  it("prefers the longer / more specific entry", () => {
    // "motherfucker" must win over "fuck"
    expect(censorName("Motherfucker")).toBe("*motherflower*");
    // "bullshit" must win over "shit"
    expect(censorName("Bullshit")).toBe("*bull*");
  });

  it("does NOT censor profane substrings inside clean words (Scunthorpe)", () => {
    expect(censorName("class")).toBe("class");
    expect(censorName("Hellfire")).toBe("Hellfire");
    expect(censorName("Grasshopper")).toBe("Grasshopper");
    expect(censorName("Assassin's Blade")).toBe("Assassin's Blade");
  });
});

describe("displaySpellName", () => {
  it("returns the raw name when not flagged", () => {
    expect(displaySpellName("Damn Bolt", false, false)).toBe("Damn Bolt");
  });

  it("returns the raw name in an 18+ context even when flagged", () => {
    expect(displaySpellName("Damn Bolt", true, true)).toBe("Damn Bolt");
  });

  it("censors a flagged name in a non-18+ context", () => {
    expect(displaySpellName("Damn Bolt", true, false)).toBe("*darn* Bolt");
  });

  it("handles nullish names", () => {
    expect(displaySpellName(null, true, false)).toBe("");
    expect(displaySpellName(undefined, false, false)).toBe("");
  });
});
