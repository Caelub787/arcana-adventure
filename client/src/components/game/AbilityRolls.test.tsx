// @vitest-environment jsdom
/**
 * C.A. abilities reuse the item roll builder wholesale, which is the point of
 * them: one roll system, not a second one written for abilities. What makes
 * that work is a single line - the editor asking for the right rolls - so
 * this pins the owner type to its endpoint, and pins that nothing else got
 * dragged along with it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const calls: Array<[string, string]> = [];

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  const roll = (name: string) => [{
    id: `roll-${name}`, ownerType: "x", ownerId: "y", name,
    rollType: "attack", diceFormula: "1d20", sortOrder: 0, priority: 1,
  }];
  return {
    ...actual,
    api: {
      ...actual.api,
      getAbilityRolls: (id: string) => { calls.push(["ability", id]); return Promise.resolve(roll("Ability roll")); },
      getItemRolls: (id: string) => { calls.push(["item", id]); return Promise.resolve(roll("Item roll")); },
      getSpellRolls: (id: string) => { calls.push(["spell", id]); return Promise.resolve(roll("Spell roll")); },
      getTraitRolls: (id: string) => { calls.push(["trait", id]); return Promise.resolve(roll("Trait roll")); },
      getTokenEffects: () => Promise.resolve([]),
      getPublicSkills: () => Promise.resolve([]),
    },
  };
});

import { RollEntriesEditor } from "./RollEntriesEditor";

function mount(ownerType: "item" | "spell" | "trait" | "ability", ownerId: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RollEntriesEditor ownerType={ownerType} ownerId={ownerId} canEdit={false} campaignSystem="ca" />
    </QueryClientProvider>
  );
}

beforeEach(() => { calls.length = 0; });
afterEach(() => cleanup());

describe("ability rolls", () => {
  it("reads a character's ability rolls from the character, not from an item", async () => {
    mount("ability", "char-1");
    await waitFor(() => expect(screen.getByText("Ability roll")).toBeTruthy());
    expect(calls).toEqual([["ability", "char-1"]]);
  });

  it("leaves every other owner type on the endpoint it already used", async () => {
    mount("item", "item-1");
    await waitFor(() => expect(screen.getByText("Item roll")).toBeTruthy());
    cleanup();
    mount("spell", "spell-1");
    await waitFor(() => expect(screen.getByText("Spell roll")).toBeTruthy());
    cleanup();
    mount("trait", "trait-1");
    await waitFor(() => expect(screen.getByText("Trait roll")).toBeTruthy());
    expect(calls).toEqual([["item", "item-1"], ["spell", "spell-1"], ["trait", "trait-1"]]);
  });
});
