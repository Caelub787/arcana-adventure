/**
 * Every crafting op has to be listed where ops are routed, or the client sends
 * it and the server answers "Unknown operation" — which is exactly what happened
 * to the free forge: the op existed, the button called it, and nothing came back.
 * So the two lists are checked against each other rather than kept in step by hand.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(import.meta.dirname, p), "utf8");

/** The craft ops the protocol declares. */
function declaredOps(): string[] {
  const src = read("../../shared/agnostic/protocol.ts");
  return [...new Set([...src.matchAll(/\{\s*op:\s*"(craft\.[A-Za-z]+)"/g)].map((m) => m[1]))];
}
/** The craft ops the router actually passes on to the crafting module. */
function routedOps(): string[] {
  const src = read("./ops.ts");
  const at = src.indexOf('case "craft.session"');
  const end = src.indexOf("runCraftOp", at);
  return [...new Set([...src.slice(at, end).matchAll(/case\s+"(craft\.[A-Za-z]+)"/g)].map((m) => m[1]))];
}

describe("the crafting ops the server answers", () => {
  it("covers every craft op the protocol declares", () => {
    const declared = declaredOps(), routed = routedOps();
    expect(declared.length).toBeGreaterThan(5);
    expect(declared.filter((o) => !routed.includes(o))).toEqual([]);
  });

  it("routes nothing that isn't a real op", () => {
    expect(routedOps().filter((o) => !declaredOps().includes(o))).toEqual([]);
  });

  it("includes the free forge, which is what went missing", () => {
    expect(routedOps()).toContain("craft.forgeMold");
  });
});
