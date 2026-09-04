import { describe, it, expect } from "vitest";
import {
  editKeepsGmSecrets,
  hasRedactedGmSecrets,
  redactionSignature,
} from "../gmSecretGuard";

const REDACTED = "Mara's background.\n\n█████████\n\nShe grew up in the docks.";

describe("hasRedactedGmSecrets", () => {
  it("spots a player's copy and ignores a GM's", () => {
    expect(hasRedactedGmSecrets(REDACTED)).toBe(true);
    // A GM sees the real markup, never a placeholder.
    expect(hasRedactedGmSecrets("Mara. #the vault code is 4821# Done.")).toBe(false);
    expect(hasRedactedGmSecrets("")).toBe(false);
  });
});

describe("editKeepsGmSecrets", () => {
  it("allows edits around a secret", () => {
    expect(editKeepsGmSecrets(REDACTED, REDACTED + "\n\nShe owes the guild.")).toBe(true);
    expect(editKeepsGmSecrets(REDACTED, REDACTED.replace("docks", "harbour"))).toBe(true);
  });

  it("blocks typing inside a secret", () => {
    expect(editKeepsGmSecrets(REDACTED, REDACTED.replace("█████████", "████x█████"))).toBe(false);
  });

  it("blocks deleting a secret", () => {
    expect(editKeepsGmSecrets(REDACTED, REDACTED.replace("█████████", ""))).toBe(false);
  });

  it("blocks shortening a secret from either end", () => {
    expect(editKeepsGmSecrets(REDACTED, REDACTED.replace("█████████", "████████"))).toBe(false);
  });

  it("blocks wiping the note", () => {
    expect(editKeepsGmSecrets(REDACTED, "")).toBe(false);
  });

  it("blocks duplicating a secret", () => {
    expect(editKeepsGmSecrets(REDACTED, REDACTED + "█████████")).toBe(false);
  });

  it("blocks reordering two secrets of different sizes", () => {
    const before = "A ███ B █████ C";
    const after = "A █████ B ███ C";
    expect(editKeepsGmSecrets(before, after)).toBe(false);
  });

  it("is a no-op for a GM, whose copy has no placeholders", () => {
    const gmBefore = "Mara. #code 4821# Done.";
    expect(editKeepsGmSecrets(gmBefore, "Mara. #code 9999# Done. Plus more.")).toBe(true);
    expect(editKeepsGmSecrets(gmBefore, "")).toBe(true);
  });
});

describe("redactionSignature", () => {
  it("records run lengths in order", () => {
    expect(redactionSignature("A ███ B █████ C")).toBe("3,5");
    expect(redactionSignature("no secrets here")).toBe("");
  });
});
