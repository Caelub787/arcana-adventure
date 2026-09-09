// @vitest-environment jsdom
/**
 * The workspace is a small window manager: open a note, open another, bring
 * one forward, tile them. None of that touches the notes themselves - every
 * window is an ordinary notes panel - so what's worth pinning is the window
 * bookkeeping, which is the part that would quietly go wrong.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// The panel itself is exercised elsewhere and drags in websockets, presence
// and a dozen queries; here it only needs to say which note it was handed.
const openFloating: { current: ((id: string) => void) | null } = { current: null };
vi.mock("@/components/notes/CampaignNotesPanel", () => ({
  CampaignNotesPanel: (props: any) => {
    if (props.navOnly) openFloating.current = props.onOpenFloatingNote;
    return <div data-testid={props.navOnly ? "mock-nav" : `mock-note-${props.initialNoteId}`} />;
  },
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getNotes: async () => [
        { id: "n1", title: "The Writ" },
        { id: "n2", title: "Mara" },
        { id: "n3", title: "The Long Night" },
      ],
    },
  };
});

import { NotesWorkspace } from "./NotesWorkspace";

function mount(initialNoteId?: string | null, onClose = () => {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NotesWorkspace campaignId="c1" isGm onClose={onClose} initialNoteId={initialNoteId} />
    </QueryClientProvider>,
  );
}

// The workspace remembers its layout per campaign, so each test starts from
// a clean slate rather than inheriting the previous one's windows.
beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); openFloating.current = null; });

describe("the notes workspace", () => {
  it("starts on the note the side panel was showing", () => {
    mount("n1");
    expect(screen.getByTestId("workspace-window-n1")).toBeTruthy();
    expect(screen.getByTestId("mock-note-n1")).toBeTruthy();
  });

  it("starts empty when the side panel wasn't showing one", () => {
    mount(null);
    expect(screen.queryByTestId("workspace-window-n1")).toBeNull();
    expect(screen.getByText(/Open a note from the tree/)).toBeTruthy();
  });

  it("opens each note the tree hands it, and closes them one at a time", () => {
    mount(null);
    act(() => { openFloating.current?.("n1"); });
    act(() => { openFloating.current?.("n2"); });
    expect(screen.getByTestId("workspace-window-n1")).toBeTruthy();
    expect(screen.getByTestId("workspace-window-n2")).toBeTruthy();

    fireEvent.click(screen.getByTestId("button-workspace-window-close-n1"));
    expect(screen.queryByTestId("workspace-window-n1")).toBeNull();
    expect(screen.getByTestId("workspace-window-n2")).toBeTruthy();
  });

  it("brings a note already open to the front instead of opening it twice", () => {
    mount(null);
    act(() => { openFloating.current?.("n1"); });
    act(() => { openFloating.current?.("n2"); });
    const zBefore = Number((screen.getByTestId("workspace-window-n1") as HTMLElement).style.zIndex);
    const zOther = Number((screen.getByTestId("workspace-window-n2") as HTMLElement).style.zIndex);
    expect(zOther).toBeGreaterThan(zBefore);

    act(() => { openFloating.current?.("n1"); });
    expect(screen.getAllByTestId("workspace-window-n1")).toHaveLength(1);
    const zAfter = Number((screen.getByTestId("workspace-window-n1") as HTMLElement).style.zIndex);
    expect(zAfter).toBeGreaterThan(zOther);
  });

  it("won't offer Split or Tile until there are two notes to arrange", () => {
    mount("n1");
    expect((screen.getByTestId("button-workspace-split") as HTMLButtonElement).disabled).toBe(true);
    act(() => { openFloating.current?.("n2"); });
    expect((screen.getByTestId("button-workspace-split") as HTMLButtonElement).disabled).toBe(false);
  });

  it("lays two notes out side by side, not on top of each other", () => {
    mount(null);
    act(() => { openFloating.current?.("n1"); });
    act(() => { openFloating.current?.("n2"); });
    fireEvent.click(screen.getByTestId("button-workspace-split"));
    const a = screen.getByTestId("workspace-window-n1") as HTMLElement;
    const b = screen.getByTestId("workspace-window-n2") as HTMLElement;
    expect(a.style.top).toBe(b.style.top);
    expect(parseInt(b.style.left, 10)).toBeGreaterThan(parseInt(a.style.left, 10));
  });

  it("comes back the way it was left", () => {
    const first = mount(null);
    act(() => { openFloating.current?.("n1"); });
    act(() => { openFloating.current?.("n2"); });
    fireEvent.click(screen.getByTestId("button-workspace-split"));
    const left = (screen.getByTestId("workspace-window-n1") as HTMLElement).style.left;
    first.unmount();

    mount(null);
    expect(screen.getByTestId("workspace-window-n1")).toBeTruthy();
    expect(screen.getByTestId("workspace-window-n2")).toBeTruthy();
    expect((screen.getByTestId("workspace-window-n1") as HTMLElement).style.left).toBe(left);
  });

  it("forgets a window whose note is gone", async () => {
    localStorage.setItem("aa-notes-workspace-c1", JSON.stringify([
      { noteId: "n1", x: 0, y: 0, w: 400, h: 300, z: 1 },
      { noteId: "deleted", x: 0, y: 0, w: 400, h: 300, z: 2 },
    ]));
    mount(null);
    // Both are up until the note list arrives; the missing one goes then,
    // rather than the saved layout being thrown away while it loads.
    expect(screen.getByTestId("workspace-window-deleted")).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("workspace-window-deleted")).toBeNull());
    expect(screen.getByTestId("workspace-window-n1")).toBeTruthy();
  });

  it("leaves the workspace on Escape", () => {
    const onClose = vi.fn();
    mount("n1", onClose);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
