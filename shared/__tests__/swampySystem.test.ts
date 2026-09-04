import { describe, it, expect } from "vitest";
import * as CA from "../ca";
import * as SW from "../swampy";
import { isWoundSystem, woundSystemRules } from "../systemRules";
import {
  SYSTEM_SLUGS,
  SYSTEM_LABELS,
  PUBLIC_SYSTEM_SLUGS,
  isPublicSystem,
  selectableSystemSlugs,
  systemLabel,
  systemSlug,
} from "../systems";

describe("system registry", () => {
  it("labels every slug, and round-trips label -> slug", () => {
    for (const slug of SYSTEM_SLUGS) {
      expect(SYSTEM_LABELS[slug]).toBeTruthy();
      expect(systemSlug(systemLabel(slug))).toBe(slug);
    }
  });

  it("names Swampy as its own system", () => {
    expect(SYSTEM_SLUGS).toContain("swampy");
    expect(systemLabel("swampy")).toBe("Swampy");
  });

  it("only offers the two live systems to non-admins", () => {
    expect(selectableSystemSlugs(false)).toEqual(["ca", "swampy"]);
    expect(selectableSystemSlugs(true)).toEqual(SYSTEM_SLUGS);
    for (const slug of ["arcana-adventure", "aa-v2", "aa-v3"]) {
      expect(isPublicSystem(slug)).toBe(false);
    }
    for (const slug of PUBLIC_SYSTEM_SLUGS) {
      expect(isPublicSystem(slug)).toBe(true);
    }
  });
});

// Swampy started as a copy of C.A. and shared its pinned-wound model. It now
// runs Daggerheart's HP + damage thresholds + Strain instead, so it must no
// longer resolve as a wound system - otherwise the shared wound UI would try
// to render a body diagram for it.
describe("Swampy is no longer a wound system", () => {
  it("leaves C.A. as the only one", () => {
    expect(isWoundSystem("ca")).toBe(true);
    expect(isWoundSystem("swampy")).toBe(false);
    expect(isWoundSystem("aa-v3")).toBe(false);
    expect(woundSystemRules("ca").slug).toBe("ca");
  });

  it("shares nothing with C.A.'s ruleset", () => {
    expect(Object.keys(SW)).not.toContain("SWAMPY_SKILLS");
    expect((SW as any).SWAMPY_WOUND_MAX).toBeUndefined();
    // C.A. is untouched by any of this.
    expect(CA.CA_SKILLS.length).toBe(19);
    expect(CA.CA_WOUND_MAX).toBe(20);
  });
});

describe("traits", () => {
  it("carries Daggerheart's six traits, not C.A.'s attributes", () => {
    expect(SW.SWAMPY_TRAIT_KEYS).toEqual([
      "agility", "strength", "finesse", "instinct", "presence", "knowledge",
    ]);
    // Anemos was C.A.'s magic attribute; Swampy has no fixed spellcasting.
    expect(SW.SWAMPY_TRAIT_KEYS).not.toContain("anemos");
  });

  it("starts every trait at zero", () => {
    const t = SW.makeEmptySwampyTraits();
    expect(Object.keys(t)).toEqual(SW.SWAMPY_TRAIT_KEYS);
    expect(Object.values(t).every((v) => v === 0)).toBe(true);
  });
});

describe("duality dice", () => {
  const D = (h: number, f: number, mod = 0, diff: number | null = null) =>
    SW.resolveSwampyDuality(h, f, mod, diff);

  it("adds both dice and the modifier", () => {
    expect(D(7, 4, 2).total).toBe(13);
  });

  it("succeeds with Hope when the Hope die wins and the roll beats Difficulty", () => {
    const r = D(9, 3, 0, 10);
    expect(r.outcome).toBe("success-hope");
    expect(r.gainsHope).toBe(true);
    expect(r.gainsFear).toBe(false);
  });

  it("succeeds with Fear when the Fear die wins", () => {
    const r = D(3, 9, 0, 10);
    expect(r.outcome).toBe("success-fear");
    expect(r.gainsHope).toBe(false);
    expect(r.gainsFear).toBe(true);
  });

  it("fails with Hope - still a Hope, still avoids the worst", () => {
    const r = D(5, 2, 0, 20);
    expect(r.outcome).toBe("failure-hope");
    expect(r.gainsHope).toBe(true);
    expect(r.gainsFear).toBe(false);
  });

  it("fails with Fear when the Fear die wins and the roll misses", () => {
    const r = D(2, 5, 0, 20);
    expect(r.outcome).toBe("failure-fear");
    expect(r.gainsFear).toBe(true);
  });

  it("treats matching dice as a critical, whatever the Difficulty", () => {
    const r = D(4, 4, 0, 40);
    expect(r.isCritical).toBe(true);
    expect(r.outcome).toBe("critical");
    expect(r.gainsHope).toBe(true);
    expect(r.gainsFear).toBe(false);
    expect(r.clearsStrain).toBe(true);
  });

  it("reports which die won even with no Difficulty set", () => {
    expect(D(11, 2).outcome).toBe("failure-hope");
    expect(D(2, 11).outcome).toBe("failure-fear");
  });

  it("clamps dice into a d12's range", () => {
    expect(D(99, -4).hopeDie).toBe(12);
    expect(D(99, -4).fearDie).toBe(1);
  });

  it("labels and describes every outcome", () => {
    for (const key of Object.keys(SW.SWAMPY_OUTCOME_LABELS) as SW.SwampyRollOutcome[]) {
      expect(SW.SWAMPY_OUTCOME_LABELS[key]).toBeTruthy();
      expect(SW.SWAMPY_OUTCOME_DESCRIPTIONS[key]).toBeTruthy();
    }
  });
});

describe("hope and fear", () => {
  it("caps Hope at 6 and Fear at 12", () => {
    expect(SW.clampSwampyHope(99)).toBe(6);
    expect(SW.clampSwampyHope(-3)).toBe(0);
    expect(SW.clampSwampyFear(99)).toBe(12);
    expect(SW.clampSwampyFear(-3)).toBe(0);
  });
});

describe("damage thresholds", () => {
  const t = { major: 8, severe: 16 };

  it("costs 1 HP under Major, 2 at Major, 3 at Severe", () => {
    expect(SW.swampyHpCostForDamage(7, t)).toBe(1);
    expect(SW.swampyHpCostForDamage(8, t)).toBe(2);
    expect(SW.swampyHpCostForDamage(15, t)).toBe(2);
    expect(SW.swampyHpCostForDamage(16, t)).toBe(3);
    expect(SW.swampyHpCostForDamage(99, t)).toBe(3);
  });

  it("lets an Armour Slot step the hit down a tier", () => {
    expect(SW.swampyHpCostForDamage(16, t, 1)).toBe(2);
    expect(SW.swampyHpCostForDamage(16, t, 2)).toBe(1);
  });

  it("never armours a hit below 1 HP - armour is limited", () => {
    expect(SW.swampyHpCostForDamage(16, t, 5)).toBe(1);
    expect(SW.swampyHpCostForDamage(3, t, 5)).toBe(1);
  });

  it("ignores zero damage entirely", () => {
    expect(SW.swampyHpCostForDamage(0, t)).toBe(0);
  });

  it("names the tier a hit landed in", () => {
    expect(SW.swampyThresholdLabel(7, t)).toBe("Minor");
    expect(SW.swampyThresholdLabel(8, t)).toBe("Major");
    expect(SW.swampyThresholdLabel(16, t)).toBe("Severe");
  });
});

describe("strain", () => {
  it("marks a character Vulnerable at full Strain", () => {
    expect(SW.isSwampyVulnerable(5, 6)).toBe(false);
    expect(SW.isSwampyVulnerable(6, 6)).toBe(true);
    expect(SW.isSwampyVulnerable(7, 6)).toBe(true);
  });

  it("spills Strain past the track into HP damage", () => {
    const r = SW.applySwampyStrain(4, 6, 4);
    expect(r.strain).toBe(6);
    expect(r.hpDamage).toBe(2);
  });

  it("reports the moment a character becomes Vulnerable", () => {
    expect(SW.applySwampyStrain(4, 6, 2).becameVulnerable).toBe(true);
    // already Vulnerable - it isn't news the second time
    expect(SW.applySwampyStrain(6, 6, 2).becameVulnerable).toBe(false);
    expect(SW.applySwampyStrain(6, 6, 2).hpDamage).toBe(2);
  });
});

describe("warren conditions", () => {
  it("carries all nine from the brief", () => {
    expect(SW.SWAMPY_WARREN_CONDITION_KEYS).toEqual([
      "flourishing", "wounded", "poisoned", "starved",
      "bound", "sleeping", "dying", "shattered", "returning",
    ]);
  });

  it("says what each one does to magic drawn from it", () => {
    for (const c of SW.SWAMPY_WARREN_CONDITIONS) {
      expect(c.name).toBeTruthy();
      expect(c.effect).toBeTruthy();
      expect(c.color).toMatch(/^text-/);
    }
  });

  it("falls back to Flourishing for an unknown condition", () => {
    expect(SW.swampyWarrenCondition("nonsense").key).toBe("flourishing");
    expect(SW.swampyWarrenCondition(null).key).toBe("flourishing");
    expect(SW.swampyWarrenCondition("dying").name).toBe("Dying");
  });
});

describe("drawing checklists", () => {
  it("keeps the player declaration and GM response in the brief's order", () => {
    expect(SW.SWAMPY_DRAW_DECLARATION.map((d) => d.key)).toEqual(["intent", "warren", "method", "limit"]);
    expect(SW.SWAMPY_GM_RESPONSE.map((d) => d.key))
      .toEqual(["possible", "effect", "roll", "cost", "condition", "risk"]);
  });

  it("runs the four checks on every Status", () => {
    expect(SW.SWAMPY_STATUS_CHECKS.map((c) => c.key)).toEqual(["access", "nature", "scale", "cost"]);
  });

  it("offers routes forward and overdraw costs to choose from", () => {
    expect(SW.SWAMPY_ROUTES_FORWARD.length).toBeGreaterThan(0);
    expect(SW.SWAMPY_OVERDRAW_COSTS.length).toBeGreaterThan(0);
  });

  it("records every ledger field the brief lists", () => {
    expect(SW.SWAMPY_WORKING_FIELDS.map((f) => f.key)).toEqual([
      "name", "warrenName", "method", "effect", "cost", "limits", "conditionInteraction", "risk",
    ]);
  });
});

describe("experiences", () => {
  it("defaults a new Experience to +2", () => {
    expect(SW.makeSwampyExperience().modifier).toBe(SW.SWAMPY_EXPERIENCE_BONUS);
  });

  it("drops malformed rows rather than throwing", () => {
    const out = SW.normalizeSwampyExperiences([
      { id: "a", name: "Docks kid", modifier: 2 },
      null,
      "nonsense",
      { name: "No id", modifier: "3" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[1].id).toBeTruthy();
    expect(out[1].modifier).toBe(3);
    expect(SW.normalizeSwampyExperiences(undefined)).toEqual([]);
  });
});

describe("deck of houses", () => {
  it("offers the three spreads with matching position counts", () => {
    for (const s of SW.SWAMPY_READING_SPREADS) {
      expect(s.positions).toHaveLength(s.count);
    }
  });

  it("falls back to the single-card spread", () => {
    expect(SW.swampyReadingSpread("nonsense").key).toBe("single");
    expect(SW.swampyReadingSpread("house").count).toBe(5);
  });
});
