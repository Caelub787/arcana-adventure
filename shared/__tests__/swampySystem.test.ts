import { describe, it, expect } from "vitest";
import * as CA from "../ca";
import * as SW from "../swampy";
import {
  isWoundSystem,
  woundSystemRules,
} from "../systemRules";
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

describe("wound systems", () => {
  it("recognises exactly C.A. and Swampy", () => {
    expect(isWoundSystem("ca")).toBe(true);
    expect(isWoundSystem("swampy")).toBe(true);
    expect(isWoundSystem("aa-v3")).toBe(false);
    expect(isWoundSystem(undefined)).toBe(false);
  });

  it("gives each system its own character columns", () => {
    const ca = woundSystemRules("ca");
    const sw = woundSystemRules("swampy");
    expect(ca.woundsField).toBe("caWounds");
    expect(sw.woundsField).toBe("swampyWounds");
    expect(ca.bodySexField).not.toBe(sw.bodySexField);
    expect(ca.energyPoolField).not.toBe(sw.energyPoolField);
  });

  // The whole point of the fork: a Swampy character's state must be invisible
  // to C.A. and vice versa, even on the same row.
  it("never reads the other system's wound data", () => {
    const ca = woundSystemRules("ca");
    const sw = woundSystemRules("swampy");
    const character = {
      caWounds: [{ id: "a", x: 10, y: 10, name: "Cut", severity: "serious", description: "", effects: [] }],
      swampyWounds: [],
      caEnergyPool: 7,
      swampyEnergyPool: 0,
      caBodySex: "female",
      swampyBodySex: "male",
    };
    expect(ca.normalizeWounds(ca.woundsOf(character))).toHaveLength(1);
    expect(sw.normalizeWounds(sw.woundsOf(character))).toHaveLength(0);
    expect(ca.woundTotalCost(ca.woundsOf(character))).toBe(3);
    expect(sw.woundTotalCost(sw.woundsOf(character))).toBe(0);
    expect(ca.energyPoolOf(character)).toBe(7);
    expect(sw.energyPoolOf(character)).toBe(0);
    expect(ca.bodySexOf(character)).toBe("female");
    expect(sw.bodySexOf(character)).toBe("male");
  });

  it("falls back to C.A.'s pack for a non-wound slug rather than throwing", () => {
    expect(woundSystemRules("aa-v3").slug).toBe("ca");
    expect(woundSystemRules(undefined).slug).toBe("ca");
  });
});

describe("swampy is a real fork of ca, not an alias", () => {
  it("exposes its own constant objects", () => {
    const ca = woundSystemRules("ca");
    const sw = woundSystemRules("swampy");
    // Same values today (Swampy started as a copy), but distinct objects — so
    // editing shared/swampy.ts can never move C.A.'s numbers, or vice versa.
    expect(sw.SKILLS).not.toBe(ca.SKILLS);
    expect(sw.ATTRIBUTES).not.toBe(ca.ATTRIBUTES);
    expect(sw.WOUND_SEVERITY_COST).not.toBe(ca.WOUND_SEVERITY_COST);
    expect(SW.SWAMPY_SKILLS).not.toBe(CA.CA_SKILLS);
  });

  it("carries the full rule surface C.A. has", () => {
    expect(SW.SWAMPY_ATTRIBUTES).toHaveLength(CA.CA_ATTRIBUTES.length);
    expect(SW.SWAMPY_SKILLS).toHaveLength(CA.CA_SKILLS.length);
    expect(SW.SWAMPY_WOUND_MAX).toBe(CA.CA_WOUND_MAX);
    expect(Object.keys(SW.makeEmptySwampySkills())).toEqual(SW.SWAMPY_SKILL_KEYS);
  });

  it("builds wounds through its own factory", () => {
    const w = SW.makeSwampyWound(150, -20);
    expect(w.x).toBe(100);
    expect(w.y).toBe(0);
    expect(w.severity).toBe("minor");
    expect(w.effects).toEqual([]);
  });
});
