// @vitest-environment jsdom
/**
 * Client contract for the V3 free hotbar teammate tiles:
 *   - a slot whose character has canEdit=false opens the read-only peek
 *     dialog (name + HP/Energy/Mana, no sheet), and
 *   - a slot whose character has canEdit=true (or the flag omitted) opens
 *     the full character sheet via onOpenCharacterSheet.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const getFreeHotbar = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    getFreeHotbar: (...args: any[]) => getFreeHotbar(...args),
    setFreeHotbarSlot: vi.fn(),
    deleteFreeHotbarEntry: vi.fn(),
    getCampaignCharacters: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// GameComponents is a very large module; the hotbar only needs LazyItemImage.
vi.mock("./GameComponents", () => ({
  LazyItemImage: () => null,
}));

import { V3FreeHotbar } from "./V3FreeHotbar";

beforeAll(() => {
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

afterEach(() => {
  cleanup();
  localStorage.clear();
  getFreeHotbar.mockReset();
});

const campaignId = "camp1";

function makeEntry(overrides: Record<string, any> = {}) {
  return {
    id: "entry-1",
    loadoutIndex: 0,
    slotIndex: 0,
    characterId: "char-view",
    itemId: null,
    item: null,
    sourceCharacter: null,
    character: {
      id: "char-view",
      name: "Borrowed Hero",
      portrait: null,
      hp: 17,
      maxHp: 25,
      energy: 3,
      maxEnergy: 6,
      mana: 9,
      maxMana: 12,
      canEdit: false,
    },
    ...overrides,
  };
}

function renderHotbar(entries: any[], onOpenCharacterSheet = vi.fn()) {
  getFreeHotbar.mockResolvedValue(entries);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, queryFn: async () => [] },
    },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <V3FreeHotbar
        campaignId={campaignId}
        isGM={false}
        onOpenCharacterSheet={onOpenCharacterSheet}
        onOpenItem={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return { onOpenCharacterSheet };
}

describe("V3FreeHotbar — canEdit click contract", () => {
  it("canEdit=false opens the read-only peek dialog, not the sheet", async () => {
    const { onOpenCharacterSheet } = renderHotbar([makeEntry()]);

    // Wait until the entry has rendered into slot 0 (portrait-less => User icon,
    // but the stat bars container is a reliable marker).
    await waitFor(() =>
      expect(screen.getByTestId("free-hotbar-slot-0-bars")).toBeTruthy(),
    );

    fireEvent.click(screen.getByTestId("free-hotbar-slot-0"));

    await waitFor(() =>
      expect(screen.getByTestId("dialog-char-peek")).toBeTruthy(),
    );
    expect(screen.getByTestId("text-peek-name").textContent).toBe("Borrowed Hero");
    expect(screen.getByTestId("text-peek-hp").textContent).toBe("17 / 25");
    expect(screen.getByTestId("text-peek-energy").textContent).toBe("3 / 6");
    expect(screen.getByTestId("text-peek-mana").textContent).toBe("9 / 12");
    expect(onOpenCharacterSheet).not.toHaveBeenCalled();
  });

  it("canEdit=true opens the character sheet, not the peek dialog", async () => {
    const entry = makeEntry({
      id: "entry-2",
      characterId: "char-edit",
      character: {
        id: "char-edit",
        name: "My Hero",
        portrait: null,
        hp: 10,
        maxHp: 10,
        energy: 5,
        maxEnergy: 5,
        mana: 4,
        maxMana: 4,
        canEdit: true,
      },
    });
    const { onOpenCharacterSheet } = renderHotbar([entry]);

    await waitFor(() =>
      expect(screen.getByTestId("free-hotbar-slot-0-bars")).toBeTruthy(),
    );

    fireEvent.click(screen.getByTestId("free-hotbar-slot-0"));

    expect(onOpenCharacterSheet).toHaveBeenCalledWith("char-edit");
    expect(screen.queryByTestId("dialog-char-peek")).toBeNull();
  });

  it("an entry without a canEdit flag (legacy payload) still opens the sheet", async () => {
    const entry = makeEntry({
      id: "entry-3",
      characterId: "char-legacy",
      character: {
        id: "char-legacy",
        name: "Legacy Hero",
        portrait: null,
      },
    });
    const { onOpenCharacterSheet } = renderHotbar([entry]);

    // Legacy entries have no stat bars; wait for the slot to hold the entry by
    // polling until a click routes to the sheet handler.
    await waitFor(() => {
      fireEvent.click(screen.getByTestId("free-hotbar-slot-0"));
      expect(onOpenCharacterSheet).toHaveBeenCalledWith("char-legacy");
    });
    expect(screen.queryByTestId("dialog-char-peek")).toBeNull();
  });
});
