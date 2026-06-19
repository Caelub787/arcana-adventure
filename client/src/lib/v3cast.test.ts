import { describe, it, expect, beforeEach, vi } from "vitest";
import type { V3Spell } from "@/lib/api";
import type { V3SpellComposition } from "@shared/v3spells";

// ---------------------------------------------------------------------------
// castV3Spell pulls in the live WebSocket client and the roll-notification
// feed, neither of which exist outside the browser. Replace both with spies so
// we can assert the mana actually deducted (the 2nd arg of sendCombatMana) and
// keep the dice roll deterministic.
// ---------------------------------------------------------------------------
const sendCombatMana = vi.fn();
const triggerRollNotification = vi.fn();

vi.mock("@/lib/api", () => ({
  gameWs: {
    sendCombatMana: (...args: any[]) => sendCombatMana(...args),
  },
}));

vi.mock("@/components/game/RollNotification", () => ({
  triggerRollNotification: (...args: any[]) => triggerRollNotification(...args),
}));

import { v3ReachExtraMana, castV3Spell } from "./v3cast";

// A composition crafted at the "near" reach (index 3 in V3_REACHES). The
// reaches in order are: self(0) touch(1) close(2) near(3) far(4) extreme(5)
// unlimited(6).
const NEAR_COMP: V3SpellComposition = {
  core: "fire",
  secondaries: [],
  intent: "destroy",
  delivery: "projectile",
  reach: "near",
  duration: "instant",
};

function makeSpell(overrides: Partial<V3Spell> = {}): V3Spell {
  return {
    id: "spell1",
    campaignId: "camp1",
    spellbookItemId: "book1",
    composition: NEAR_COMP,
    compositionHash: "hash1",
    name: "Firebolt",
    description: "A dart of flame.",
    image: null,
    manaCost: 5,
    craftDc: 0,
    createdByUserId: "user1",
    createdByCharacterId: "char1",
    authoredByUserId: "gm1",
    status: "ready",
    isCanonical: false,
    flagged: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// v3ReachExtraMana: the delta is (chosen reach slot - crafted reach slot). The
// spell's base mana already includes its crafted reach, so casting at the same
// reach (or with no override / an unknown key) adds nothing; a shorter reach is
// negative and a longer reach is positive.
// ---------------------------------------------------------------------------
describe("v3ReachExtraMana", () => {
  it("returns 0 when the chosen reach equals the crafted reach", () => {
    expect(v3ReachExtraMana(makeSpell(), "near")).toBe(0);
  });

  it("returns 0 when no reach override is given", () => {
    expect(v3ReachExtraMana(makeSpell(), undefined)).toBe(0);
    expect(v3ReachExtraMana(makeSpell(), null)).toBe(0);
  });

  it("returns a negative delta when casting at a shorter reach (below)", () => {
    // crafted near(3) -> touch(1) = 1 - 3 = -2
    expect(v3ReachExtraMana(makeSpell(), "touch")).toBe(-2);
    // crafted near(3) -> self(0) = 0 - 3 = -3
    expect(v3ReachExtraMana(makeSpell(), "self")).toBe(-3);
  });

  it("returns a positive delta when casting at a longer reach (above)", () => {
    // crafted near(3) -> far(4) = 4 - 3 = +1
    expect(v3ReachExtraMana(makeSpell(), "far")).toBe(1);
    // crafted near(3) -> unlimited(6) = 6 - 3 = +3
    expect(v3ReachExtraMana(makeSpell(), "unlimited")).toBe(3);
  });

  it("returns 0 for an unknown reach key on either side", () => {
    expect(v3ReachExtraMana(makeSpell(), "bogus")).toBe(0);
    const noReach = makeSpell({
      composition: { ...NEAR_COMP, reach: "bogus" },
    });
    expect(v3ReachExtraMana(noReach, "far")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// castV3Spell deducts base + level-extra + reach-delta mana (floored at 0) via
// gameWs.sendCombatMana. We pin Math.random so the dice roll never trips the
// "Not Enough Mana" guard via some unrelated path.
// ---------------------------------------------------------------------------
describe("castV3Spell — mana deduction with a reach override", () => {
  beforeEach(() => {
    sendCombatMana.mockReset();
    triggerRollNotification.mockReset();
    // Deterministic dice: floor(0.5 * sides) + 1 (irrelevant to mana math).
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  // The amount of mana passed to sendCombatMana, or undefined when no mana was
  // deducted (e.g. the cast was blocked or cost 0).
  function deductedMana(): number | undefined {
    if (!sendCombatMana.mock.calls.length) return undefined;
    return sendCombatMana.mock.calls[0][1];
  }

  it("deducts base + level extra + reach delta when casting at a longer reach", () => {
    const character = { id: "char1", name: "Mage", mana: 100 };
    // base 5 (near), level 3 -> +2 extra, reach near(3) -> extreme(5) = +2.
    const ok = castV3Spell(character, makeSpell(), 3, "extreme");
    expect(ok).toBe(true);
    expect(deductedMana()).toBe(5 + 2 + 2);
  });

  it("deducts less when casting at a shorter reach", () => {
    const character = { id: "char1", name: "Mage", mana: 100 };
    // base 5, level 1 -> +0, reach near(3) -> touch(1) = -2.
    const ok = castV3Spell(character, makeSpell(), 1, "touch");
    expect(ok).toBe(true);
    expect(deductedMana()).toBe(5 - 2);
  });

  it("matches base + level extra when the reach is unchanged", () => {
    const character = { id: "char1", name: "Mage", mana: 100 };
    // base 5, level 5 -> +4, reach unchanged -> +0.
    const ok = castV3Spell(character, makeSpell(), 5, "near");
    expect(ok).toBe(true);
    expect(deductedMana()).toBe(5 + 4);
  });

  it("floors the total at 0 and skips the deduction when the reach delta drives cost negative", () => {
    // base 1, level 1 (+0), crafted at far(4), cast at self(0) = -4 -> total -3 -> floored to 0.
    const cheapSpell = makeSpell({
      manaCost: 1,
      composition: { ...NEAR_COMP, reach: "far" },
    });
    const character = { id: "char1", name: "Mage", mana: 0 };
    const ok = castV3Spell(character, cheapSpell, 1, "self");
    expect(ok).toBe(true);
    // totalMana === 0, so the combat-mana path is never called.
    expect(sendCombatMana).not.toHaveBeenCalled();
  });

  it("blocks the cast when the reach override pushes mana above the character's pool", () => {
    // base 5, level 1, reach near(3) -> unlimited(6) = +3 -> total 8 > 7 available.
    const character = { id: "char1", name: "Mage", mana: 7 };
    const ok = castV3Spell(character, makeSpell(), 1, "unlimited");
    expect(ok).toBe(false);
    expect(sendCombatMana).not.toHaveBeenCalled();
    // The player is told why via a system notification.
    expect(triggerRollNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "system", label: "Not Enough Mana!" }),
    );
  });
});
