/**
 * Aiming a blow. You only get the choice when the attack beats the target's
 * DC by 5 or more — the same roll that causes a wound — and then it costs
 * Focus, more the finer the target.
 */
import { describe, it, expect } from "vitest";
import {
  CA_WOUND_LOCATIONS, CA_WOUND_LOCATION_FOCUS_COST, CA_WOUND_SEVERITY_MARGIN, caWoundSeverityForMargin,
} from "./ca";

describe("what it costs to aim", () => {
  it("charges for the body too — nowhere is free", () => {
    expect(CA_WOUND_LOCATION_FOCUS_COST.body).toBe(2);
  });

  it("costs the same for an arm as for a leg", () => {
    expect(CA_WOUND_LOCATION_FOCUS_COST.arm).toBe(4);
    expect(CA_WOUND_LOCATION_FOCUS_COST.leg).toBe(4);
  });

  it("asks most for the head", () => {
    expect(CA_WOUND_LOCATION_FOCUS_COST.head).toBe(6);
  });

  it("costs more the smaller the target", () => {
    const { body, arm, leg, head } = CA_WOUND_LOCATION_FOCUS_COST;
    expect(body).toBeLessThan(arm);
    expect(arm).toBe(leg);
    expect(leg).toBeLessThan(head);
  });

  it("has a price for every place a wound can land", () => {
    for (const loc of CA_WOUND_LOCATIONS) expect(CA_WOUND_LOCATION_FOCUS_COST[loc]).toBeGreaterThan(0);
  });
});

describe("when the choice is yours", () => {
  it("is the same roll that wounds: 5 over the DC", () => {
    expect(CA_WOUND_SEVERITY_MARGIN.minor).toBe(5);
    expect(caWoundSeverityForMargin(5)).toBe("minor");
  });

  it("is not on offer for a hit that only takes health", () => {
    expect(caWoundSeverityForMargin(4)).toBeNull();
  });
});
