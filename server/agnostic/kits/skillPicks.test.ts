/**
 * The gold line above the skills table says what is still wrong with the
 * picks. It used to read "Skill picks: 6 at +2, the +4, the −2", which looks
 * like the rule rather than what is left of it — and "the +4" says nothing
 * about how many. One shape throughout, a count even when it is one, and
 * each side said in its own words.
 */
import { describe, it, expect } from "vitest";
import { parseFormula, evaluate } from "@shared/agnostic/formula";

// The kit reaches the database through its import chain, and all we want from
// it here are some strings. A connection string is enough to get past the
// guard at the top of server/db.ts; nothing in this file opens a connection.
process.env.DATABASE_URL ||= "postgres://unused/unused";
const { CREATION_SKILLS_FORMULA, SKILL_PICKS_FORMULA, SKILL_DONE_TEXT, SKILL_PICKS } = await import("./ca");

/** The line as a character with these picks would see it. */
const line = (src: string, picks: { plus: number; best: number; worst: number }) => {
  const have: Record<string, number> = { skill_plus: picks.plus, skill_best: picks.best, skill_worst: picks.worst };
  const out = evaluate(parseFormula(src), {
    ref: (path) => {
      const k = path[path.length - 1];
      if (!(k in have)) throw new Error(`unknown field ${k}`);
      return have[k];
    },
  });
  return String(out.value).replace(/\s+/g, " ").trim();
};

const { plus, best, worst } = SKILL_PICKS;
const NONE = { plus: 0, best: 0, worst: 0 };
const ALL = { plus: plus.count, best: best.count, worst: worst.count };

describe("the skill picks line", () => {
  it("counts every kind, including the ones you only get one of", () => {
    expect(line(CREATION_SKILLS_FORMULA, NONE)).toBe("Skills: still to pick 6 at +2, 1 at +4, 1 at −2");
  });

  it("never says 'the +4'", () => {
    for (const p of [NONE, { plus: 3, best: 0, worst: 0 }, { plus: 6, best: 0, worst: 1 }]) {
      expect(line(CREATION_SKILLS_FORMULA, p)).not.toMatch(/\bthe [+−]/);
    }
  });

  it("counts down as picks are made", () => {
    expect(line(CREATION_SKILLS_FORMULA, { plus: 1, best: 0, worst: 0 })).toBe("Skills: still to pick 5 at +2, 1 at +4, 1 at −2");
    expect(line(CREATION_SKILLS_FORMULA, { plus: 6, best: 1, worst: 0 })).toBe("Skills: still to pick 1 at −2");
  });

  it("says when there are too many, and of what", () => {
    expect(line(CREATION_SKILLS_FORMULA, { plus: 8, best: 1, worst: 1 })).toBe("Skills: too many 2 at +2");
    expect(line(CREATION_SKILLS_FORMULA, { plus: 6, best: 3, worst: 1 })).toBe("Skills: too many 2 at +4");
  });

  it("says both at once when both are wrong, and keeps them apart", () => {
    const out = line(CREATION_SKILLS_FORMULA, { plus: 4, best: 3, worst: 1 });
    expect(out).toBe("Skills: still to pick 2 at +2 · too many 2 at +4");
  });

  it("empties itself the moment the picks are right", () => {
    expect(line(CREATION_SKILLS_FORMULA, ALL)).toBe("");
  });

  it("the sheet's own value says the same thing", () => {
    expect(line(SKILL_PICKS_FORMULA, ALL)).toBe(SKILL_DONE_TEXT);
    expect(line(SKILL_PICKS_FORMULA, NONE)).toBe("Still to pick: 6 at +2, 1 at +4, 1 at −2");
    expect(line(SKILL_PICKS_FORMULA, { plus: 9, best: 1, worst: 1 })).toBe("Too many picked: 3 at +2");
  });
});
