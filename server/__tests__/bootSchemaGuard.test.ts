import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Every C.A./Swampy column declared in the schema must also have a boot-time
 * `ADD COLUMN IF NOT EXISTS` in server/app.ts.
 *
 * This is not belt-and-braces. The build-time `drizzle-kit push --force` in
 * render.yaml is unreliable for these additions - the guard in app.ts exists
 * precisely because of that, and render.yaml swallows a failed push with
 * `|| true` - so a column that only exists in schema.ts is a column Drizzle
 * will SELECT and Postgres will reject. Every character read then 500s, which
 * takes out the campaign loading screen for every system at once, not just
 * the one whose column is missing.
 *
 * That has happened. This test is how it stops happening again.
 */

const root = join(__dirname, "..", "..");
const schema = readFileSync(join(root, "shared", "schema.ts"), "utf8");
const appTs = readFileSync(join(root, "server", "app.ts"), "utf8");

// Table names share the prefix with column names, and are guarded by
// CREATE TABLE rather than ALTER TABLE, so they're checked separately.
const declaredTables = new Set(
  [...appTs.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)/g)].map((m) => m[1]),
);
const guardedColumns = new Set(
  [...appTs.matchAll(/ADD COLUMN IF NOT EXISTS\s+(\w+)/g)].map((m) => m[1]),
);

// Anything the schema names with a system prefix: `integer("ca_physique")`,
// `pgTable("swampy_warrens", ...)`, and so on.
const declaredNames = [
  ...new Set([...schema.matchAll(/"((?:ca|swampy)_[a-z0-9_]+)"/g)].map((m) => m[1])),
].sort();

describe("boot-time schema guard", () => {
  it("finds the system columns it is meant to be checking", () => {
    // A regex that quietly matches nothing would make every case below pass.
    expect(declaredNames.length).toBeGreaterThan(20);
    expect(declaredNames).toContain("ca_wounds");
    expect(guardedColumns.size).toBeGreaterThan(20);
  });

  it("guards every C.A. and Swampy column declared in the schema", () => {
    const unguarded = declaredNames.filter(
      (name) => !guardedColumns.has(name) && !declaredTables.has(name),
    );
    expect(unguarded, `Add an "ALTER TABLE ... ADD COLUMN IF NOT EXISTS" for these in server/app.ts`).toEqual([]);
  });

  it("creates every C.A. and Swampy table declared in the schema", () => {
    const tableNames = [...schema.matchAll(/pgTable\(\s*"((?:ca|swampy)_[a-z0-9_]+)"/g)].map((m) => m[1]);
    const missing = tableNames.filter((name) => !declaredTables.has(name));
    expect(missing, `Add a "CREATE TABLE IF NOT EXISTS" for these in server/app.ts`).toEqual([]);
  });
});
