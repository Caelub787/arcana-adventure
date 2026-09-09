// @vitest-environment jsdom
/**
 * The notes sidebar has two right-click menus stacked on top of each other:
 * the whole scroller offers "make something new here", and every folder and
 * note row inside it offers its own. Radix opens a context menu on
 * contextmenu without stopping the event, so without the row triggers
 * halting it both menus fire at once - which is exactly the sort of thing
 * that looks fine in the code and is a mess on screen.
 */
import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "@/components/ui/context-menu";

function Sidebar() {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div data-testid="scroller">
          <ContextMenu>
            <ContextMenuTrigger asChild onContextMenu={(e) => e.stopPropagation()}>
              <div data-testid="row">A folder</div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem data-testid="row-item">Rename folder</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
          <div data-testid="blank" style={{ minHeight: 100 }} />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem data-testid="root-item">New Note</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

afterEach(() => cleanup());

describe("the notes sidebar's right-click menus", () => {
  it("opens the New menu from anywhere in the tree, not just the strip under it", () => {
    render(<Sidebar />);
    fireEvent.contextMenu(screen.getByTestId("scroller"));
    expect(screen.getByTestId("root-item")).toBeTruthy();
    expect(screen.queryByTestId("row-item")).toBeNull();
  });

  it("still opens the New menu from the blank space below the last folder", () => {
    render(<Sidebar />);
    fireEvent.contextMenu(screen.getByTestId("blank"));
    expect(screen.getByTestId("root-item")).toBeTruthy();
  });

  it("gives a folder row its own menu and only its own", () => {
    render(<Sidebar />);
    fireEvent.contextMenu(screen.getByTestId("row"));
    expect(screen.getByTestId("row-item")).toBeTruthy();
    expect(screen.queryByTestId("root-item")).toBeNull();
  });
});
