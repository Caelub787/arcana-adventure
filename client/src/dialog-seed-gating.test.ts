/**
 * Static regression guard: every dialog form-seeding effect that depends on
 * `initialData` (or an equivalent editing-record prop) must gate on the
 * record ID (`initialData?.id`), never on the raw object reference.
 *
 * Why: WebSocket events invalidate list queries; TanStack Query refetches
 * produce new object references for the same records. An effect gated on the
 * object reference re-seeds the form mid-edit and wipes the user's typing.
 * Gating on `?.id` makes background refetches a no-op while still reloading
 * the form when a genuinely different record is opened.
 *
 * The rendered counterpart (real typing + simulated refetch) lives in
 * `client/src/components/admin/V3SystemSpeciesDialog.reseed.test.tsx`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..", "..");

const FILES = [
  "client/src/components/admin/V3SystemSpeciesDialog.tsx",
  "client/src/pages/AdminSettings.tsx", // ItemFormDialog + other admin dialogs
  "client/src/pages/Campaign.tsx", // CampaignSpeciesFormDialog + other campaign dialogs
];

/**
 * Finds every useEffect dependency array that references `initialData` and
 * returns the raw dependency-array text with its line number.
 */
function findInitialDataDepArrays(source: string): { line: number; deps: string }[] {
  const results: { line: number; deps: string }[] = [];
  // Dependency arrays appear as `}, [ ... ]);` — match arrays mentioning initialData.
  const re = /\},\s*\[([^\]]*initialData[^\]]*)\]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const line = source.slice(0, m.index).split("\n").length;
    results.push({ line, deps: m[1] });
  }
  return results;
}

describe("dialog seeding effects gate on record id, not object identity", () => {
  for (const rel of FILES) {
    it(`${rel}: no useEffect deps contain a raw \`initialData\` reference`, () => {
      const source = readFileSync(path.join(ROOT, rel), "utf8");
      const arrays = findInitialDataDepArrays(source);

      // Sanity: the seeding pattern must actually exist in each file. If a
      // refactor moves/renames these dialogs, this test must be updated to
      // follow them rather than silently passing.
      expect(arrays.length, `expected at least one initialData-dependent effect in ${rel}`).toBeGreaterThan(0);

      const offenders = arrays.filter(({ deps }) => {
        // Split the dep list and flag any entry that is the bare object
        // (`initialData`) rather than a scalar field access (`initialData?.id`,
        // `initialData?.name`, etc.).
        return deps
          .split(",")
          .map((d) => d.trim())
          .some((d) => d === "initialData" || d === "initialData!");
      });

      expect(
        offenders,
        `raw \`initialData\` in a useEffect dependency array re-seeds the form on ` +
          `every background refetch (WS invalidation) and wipes in-progress typing. ` +
          `Gate on \`initialData?.id\` instead. Offending dep arrays at line(s): ` +
          offenders.map((o) => `${o.line} -> [${o.deps.trim()}]`).join("; "),
      ).toEqual([]);
    });
  }

  it("the three task-critical dialogs each seed via [open, initialData?.id]", () => {
    const expectations: { file: string; anchor: string }[] = [
      // V3 species dialog (admin)
      { file: "client/src/components/admin/V3SystemSpeciesDialog.tsx", anchor: "V3SystemSpeciesDialog" },
      // Item dialog (admin settings)
      { file: "client/src/pages/AdminSettings.tsx", anchor: "function ItemFormDialog" },
      // Campaign species dialog
      { file: "client/src/pages/Campaign.tsx", anchor: "function CampaignSpeciesFormDialog" },
    ];

    for (const { file, anchor } of expectations) {
      const source = readFileSync(path.join(ROOT, file), "utf8");
      const start = source.indexOf(anchor);
      expect(start, `component anchor "${anchor}" not found in ${file}`).toBeGreaterThan(-1);

      // Search the component body (from the anchor onward) for the seeding gate.
      const body = source.slice(start, start + 20000);
      expect(
        /\[open,\s*initialData\?\.id\]/.test(body),
        `${anchor} in ${file} must seed its form via a useEffect gated on [open, initialData?.id]`,
      ).toBe(true);
    }
  });
});
