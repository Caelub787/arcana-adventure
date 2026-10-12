import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { AGNOSTIC_SCHEMA_STATEMENTS } from "../agnostic-schema";

// Same reasoning as server/__tests__/bootSchemaGuard.test.ts: the deploy's
// drizzle push is unreliable, so every Agnostic table and column must also be
// created by the boot-time guard, or reads 500.
const schema = readFileSync(join(__dirname, "..", "agnostic-schema.ts"), "utf8");
const guard = AGNOSTIC_SCHEMA_STATEMENTS.join("\n");
const appTs = readFileSync(join(__dirname, "..", "..", "server", "app.ts"), "utf8");

describe("Agnostic boot schema guard", () => {
  it("is wired into server startup", () => {
    expect(appTs).toContain("...AGNOSTIC_SCHEMA_STATEMENTS");
  });

  it("creates every agnostic table", () => {
    const tables = [...schema.matchAll(/pgTable\(\s*"(agnostic_[a-z_]+)"/g)].map((m) => m[1]);
    expect(tables.length).toBeGreaterThan(8);
    for (const t of tables) expect(guard, t).toContain(`CREATE TABLE IF NOT EXISTS ${t} `);
  });

  it("declares every column the drizzle schema uses", () => {
    const blocks = [...schema.matchAll(/pgTable\(\s*"(agnostic_[a-z_]+)",\s*\{([\s\S]*?)\n\}/g)];
    for (const [, table, body] of blocks) {
      const create = AGNOSTIC_SCHEMA_STATEMENTS.find((s) => s.includes(`CREATE TABLE IF NOT EXISTS ${table} `))!;
      const cols = [...body.matchAll(/:\s*\w+\("([a-z_]+)"/g)].map((m) => m[1]);
      for (const c of cols) expect(create, `${table}.${c}`).toMatch(new RegExp(`\\b${c}\\b`));
    }
  });

  it("adds the token → note column", () => {
    expect(guard).toContain("ADD COLUMN IF NOT EXISTS agnostic_note_id");
  });
});
