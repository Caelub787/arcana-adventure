import { describe, it, expect } from "vitest";
import { v3WeaponRequiresAmmo, v3HasEquippedAmmo } from "./v3";

describe("v3WeaponRequiresAmmo", () => {
  it("is true when the weapon declares an ammunition type", () => {
    expect(v3WeaponRequiresAmmo({ ammunitionTypeId: "arrow" })).toBe(true);
  });

  it("is false for a melee weapon (no ammunition type)", () => {
    expect(v3WeaponRequiresAmmo({ ammunitionTypeId: null })).toBe(false);
    expect(v3WeaponRequiresAmmo({})).toBe(false);
    expect(v3WeaponRequiresAmmo(null)).toBe(false);
    expect(v3WeaponRequiresAmmo(undefined)).toBe(false);
  });
});

describe("v3HasEquippedAmmo", () => {
  const weapon = { itemType: "weapon", ammunitionTypeId: "arrow", isEquipped: true, quantity: 1 };

  it("returns true when no ammunition type is required", () => {
    expect(v3HasEquippedAmmo(null, [])).toBe(true);
    expect(v3HasEquippedAmmo(undefined, [weapon])).toBe(true);
  });

  it("returns true when a matching ammunition item is equipped", () => {
    const inv = [{ itemType: "ammunition", ammunitionTypeId: "arrow", isEquipped: true, quantity: 12 }];
    expect(v3HasEquippedAmmo("arrow", inv)).toBe(true);
  });

  it("returns false when matching ammo exists but is NOT equipped", () => {
    const inv = [{ itemType: "ammunition", ammunitionTypeId: "arrow", isEquipped: false, quantity: 12 }];
    expect(v3HasEquippedAmmo("arrow", inv)).toBe(false);
  });

  it("returns false when the equipped ammo is a different type", () => {
    const inv = [{ itemType: "ammunition", ammunitionTypeId: "bolt", isEquipped: true, quantity: 12 }];
    expect(v3HasEquippedAmmo("arrow", inv)).toBe(false);
  });

  it("returns false when only the weapon itself carries the ammunitionTypeId (no real ammo item)", () => {
    // The weapon carries ammunitionTypeId = the type it USES; without the
    // itemType guard this would wrongly pass.
    expect(v3HasEquippedAmmo("arrow", [weapon])).toBe(false);
  });

  it("returns false when matching ammo is equipped but quantity is 0", () => {
    const inv = [{ itemType: "ammunition", ammunitionTypeId: "arrow", isEquipped: true, quantity: 0 }];
    expect(v3HasEquippedAmmo("arrow", inv)).toBe(false);
  });
});
