// @vitest-environment jsdom
/**
 * Regression test: admin editors must stay stable when a WebSocket-driven
 * query invalidation causes a background refetch WHILE the user is editing.
 *
 * A refetch produces a NEW object reference for the record being edited
 * (same id, fresh object). The dialog seeding effects are gated on
 * `[open, initialData?.id]` — NOT on the object reference — so a refetch
 * must never re-seed the form and wipe the user's in-progress input.
 *
 * This file renders the real V3SystemSpeciesDialog and verifies:
 *   1. Typing survives a rerender with a new object reference (same id).
 *   2. Changing to a DIFFERENT id DOES re-seed (the gate still works).
 *
 * The ItemFormDialog (AdminSettings.tsx) and CampaignSpeciesFormDialog
 * (Campaign.tsx) are not exported from their (very large) page modules, so
 * they are covered by the static dependency-array test in
 * `client/src/dialog-seed-gating.test.ts` plus this manual procedure:
 *
 * MANUAL TEST PROCEDURE (any of the three dialogs):
 *   1. Open the app in two browser tabs logged in as an admin/GM.
 *   2. In tab A, open the dialog to EDIT an existing record (V3 species on
 *      /admin, an item on /admin, or a campaign species in a campaign) and
 *      start typing into the Name field without saving.
 *   3. In tab B, perform any action that broadcasts a WebSocket event and
 *      invalidates the list query (e.g. save a different record of the same
 *      type, or make a change in the campaign).
 *   4. In tab A, keep typing while tab B saves. EXPECTED: the text you typed
 *      remains exactly as typed — no field resets to the server value, the
 *      caret does not jump, and no input is lost.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api", () => ({
  api: {
    updateSystemSpecies: vi.fn(),
    createSystemSpecies: vi.fn(),
    getSystemSkills: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { V3SystemSpeciesDialog } from "./V3SystemSpeciesDialog";

beforeAll(() => {
  // jsdom is missing a few APIs Radix UI touches.
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as any;
  }
  if (!(window as any).ResizeObserver) {
    (window as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  if (!(Element.prototype as any).hasPointerCapture) {
    (Element.prototype as any).hasPointerCapture = () => false;
  }
});

function makeSpecies(overrides: Record<string, unknown> = {}) {
  // A fresh object every call — exactly what a TanStack Query refetch yields.
  return {
    id: "species-1",
    name: "Duskwalker",
    description: "A shadowy folk.",
    defaultImage: "",
    lifespan: 120,
    speed: 30,
    size: "Medium",
    naturalArmor: 5,
    attributeBonuses: { might: 1 },
    skillBonuses: {},
    defaultCustomSkills: [],
    defaultTraits: [],
    ...overrides,
  } as any;
}

function renderDialog(initialData: any) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const ui = (data: any) => (
    <QueryClientProvider client={queryClient}>
      <V3SystemSpeciesDialog
        open={true}
        onOpenChange={() => {}}
        systemName="A.A. V3"
        initialData={data}
      />
    </QueryClientProvider>
  );
  const utils = render(ui(initialData));
  return { ...utils, rerenderWith: (data: any) => utils.rerender(ui(data)) };
}

describe("V3SystemSpeciesDialog — no re-seed on background refetch", () => {
  it("preserves in-progress typing when initialData gets a new object reference (same id)", () => {
    const { rerenderWith } = renderDialog(makeSpecies());

    const nameInput = screen.getByTestId(
      "input-v3-system-species-name",
    ) as HTMLInputElement;
    expect(nameInput.value).toBe("Duskwalker");

    // User types a new name mid-edit.
    fireEvent.change(nameInput, { target: { value: "Duskwalker Reborn" } });
    expect(nameInput.value).toBe("Duskwalker Reborn");

    // A WebSocket invalidation refetches the list: same record id, brand-new
    // object reference (and even fresh server data for other fields).
    rerenderWith(makeSpecies({ description: "Server-side edit elsewhere" }));

    // The form must NOT re-seed — typed input survives.
    expect(
      (screen.getByTestId("input-v3-system-species-name") as HTMLInputElement)
        .value,
    ).toBe("Duskwalker Reborn");

    // A second refetch, same story.
    rerenderWith(makeSpecies());
    expect(
      (screen.getByTestId("input-v3-system-species-name") as HTMLInputElement)
        .value,
    ).toBe("Duskwalker Reborn");

    cleanup();
  });

  it("still re-seeds when a genuinely different record (new id) is loaded", () => {
    const { rerenderWith } = renderDialog(makeSpecies());

    const nameInput = screen.getByTestId(
      "input-v3-system-species-name",
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Scratch edits" } });
    expect(nameInput.value).toBe("Scratch edits");

    // Switching to edit a different species must reload the form.
    rerenderWith(makeSpecies({ id: "species-2", name: "Emberkin" }));
    expect(
      (screen.getByTestId("input-v3-system-species-name") as HTMLInputElement)
        .value,
    ).toBe("Emberkin");

    cleanup();
  });
});
