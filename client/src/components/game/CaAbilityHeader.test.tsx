// @vitest-environment jsdom
/**
 * The Ability header carries two GM-written values and writes them to two
 * different columns. Getting that wiring backwards is invisible in a
 * screenshot and silent at runtime - the wrong field just quietly stops
 * saving - so it is pinned here.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CaAbilityHeader, useCaInlineEdit } from "./CASheetUI";

function Harness({ character, canEdit, write }: any) {
  const edit = useCaInlineEdit(write, canEdit);
  return <CaAbilityHeader character={character} edit={edit} canEdit={canEdit} />;
}

afterEach(() => cleanup());

const named = { caAbilityName: "Emberbind", caAbilityDescription: "Binds a flame to a target." };

describe("the Ability header", () => {
  it("shows the ability's own name as its heading", () => {
    render(<Harness character={named} canEdit={false} write={() => {}} />);
    expect(screen.getByTestId("ca-ability-name-value").textContent).toBe("Emberbind");
    expect(screen.getByTestId("ca-ability-description-value").textContent).toBe("Binds a flame to a target.");
  });

  it("tells an unnamed ability apart from a named one", () => {
    render(<Harness character={{}} canEdit={false} write={() => {}} />);
    expect(screen.getByTestId("ca-ability-name-value").textContent).toBe("Unnamed ability");
  });

  it("writes the name and the description to their own fields", () => {
    const write = vi.fn();
    render(<Harness character={named} canEdit write={write} />);

    fireEvent.doubleClick(screen.getByTestId("ca-ability-name-value"));
    fireEvent.change(screen.getByTestId("input-ca-edit-ca-ability-name"), { target: { value: "Ashbind" } });
    fireEvent.click(screen.getByTestId("button-ca-save-caAbilityName"));
    expect(write).toHaveBeenCalledWith({ caAbilityName: "Ashbind" });

    fireEvent.doubleClick(screen.getByTestId("ca-ability-description-value"));
    fireEvent.change(screen.getByTestId("ca-ability-description"), { target: { value: "A short line." } });
    fireEvent.click(screen.getByTestId("button-ca-save-caAbilityDescription"));
    expect(write).toHaveBeenLastCalledWith({ caAbilityDescription: "A short line." });
  });

  it("gives a player nothing to double-click", () => {
    const write = vi.fn();
    render(<Harness character={named} canEdit={false} write={write} />);
    fireEvent.doubleClick(screen.getByTestId("ca-ability-name-value"));
    expect(screen.queryByTestId("input-ca-edit-ca-ability-name")).toBeNull();
    expect(write).not.toHaveBeenCalled();
  });
});
