// @vitest-environment jsdom
/**
 * C.A.'s sheet has no edit mode: every value is its own editor, opened by
 * double-clicking it. Two of those are easy to get subtly wrong and hard to
 * see going wrong - the Ability header writes two GM values to two different
 * columns, and the character's name is the one text field where empty is not
 * a legal answer.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CaAbilityHeader, CaInlineText, useCaInlineEdit } from "./CASheetUI";

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

describe("a name that can't be empty", () => {
  function NameHarness({ name, write }: { name: string; write: (u: any) => void }) {
    const edit = useCaInlineEdit(write, true);
    React.useEffect(() => { edit.open("name", name); }, []);
    if (edit.field !== "name") return null;
    return (
      <CaInlineText
        edit={edit}
        field="name"
        testId="ca-name"
        transform={(draft) => String(draft ?? "").trim() || name}
      />
    );
  }

  it("keeps the old name when the field is cleared and saved", () => {
    const write = vi.fn();
    render(<NameHarness name="Sable Thornbury" write={write} />);
    fireEvent.change(screen.getByTestId("input-ca-edit-ca-name"), { target: { value: "   " } });
    fireEvent.click(screen.getByTestId("button-ca-save-name"));
    expect(write).toHaveBeenCalledWith({ name: "Sable Thornbury" });
  });

  it("saves a real new name trimmed", () => {
    const write = vi.fn();
    render(<NameHarness name="Sable Thornbury" write={write} />);
    fireEvent.change(screen.getByTestId("input-ca-edit-ca-name"), { target: { value: "  Sable Ashgrove " } });
    fireEvent.click(screen.getByTestId("button-ca-save-name"));
    expect(write).toHaveBeenCalledWith({ name: "Sable Ashgrove" });
  });
});
