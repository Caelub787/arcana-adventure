import { describe, it, expect } from "vitest";
import { sceneLevels, levelForElevation, visibleLevelStack, onLevel, storedLevelId, findLevel, BASE_LEVEL_ID } from "../battlemapLevels";

const raw = [
  { id: "up", name: "Upper", elevation: 10, image: "u.png" },
  { id: "roof", name: "Roof", elevation: 20, solidFloor: true },
  { id: "cellar", name: "Cellar", elevation: -10, image: "c.png" },
];

describe("battlemap levels", () => {
  it("always includes the ground and sorts lowest first", () => {
    expect(sceneLevels([]).map((l) => l.id)).toEqual([BASE_LEVEL_ID]);
    expect(sceneLevels(raw).map((l) => l.id)).toEqual(["cellar", BASE_LEVEL_ID, "up", "roof"]);
    expect(sceneLevels([{ id: "base", name: "Street", elevation: 99 }])[0]).toMatchObject({ name: "Street", elevation: 0 });
  });
  it("maps elevation to the highest floor at or below it", () => {
    const L = sceneLevels(raw);
    expect(levelForElevation(L, 0).id).toBe(BASE_LEVEL_ID);
    expect(levelForElevation(L, 5).id).toBe(BASE_LEVEL_ID);
    expect(levelForElevation(L, 10).id).toBe("up");
    expect(levelForElevation(L, 35).id).toBe("roof");
    expect(levelForElevation(L, -5).id).toBe("cellar");
    expect(levelForElevation(L, -50).id).toBe("cellar");
  });
  it("stacks the levels a viewer can see", () => {
    const L = sceneLevels(raw);
    expect(visibleLevelStack(L, "up").map((l) => l.id)).toEqual(["cellar", BASE_LEVEL_ID, "up"]);
    expect(visibleLevelStack(L, "roof").map((l) => l.id)).toEqual(["roof"]);
    expect(visibleLevelStack(L, "cellar").map((l) => l.id)).toEqual(["cellar"]);
    const withSolidGround = sceneLevels([...raw, { id: "base", name: "Ground", elevation: 0, solidFloor: true }]);
    expect(visibleLevelStack(withSolidGround, "up").map((l) => l.id)).toEqual([BASE_LEVEL_ID, "up"]);
  });
  it("treats untagged things as ground", () => {
    expect(onLevel(null, BASE_LEVEL_ID)).toBe(true);
    expect(onLevel(undefined, "up")).toBe(false);
    expect(onLevel("up", "up")).toBe(true);
    expect(storedLevelId(BASE_LEVEL_ID)).toBeNull();
    expect(storedLevelId("up")).toBe("up");
    expect(findLevel(sceneLevels(raw), "missing").id).toBe(BASE_LEVEL_ID);
  });
});
