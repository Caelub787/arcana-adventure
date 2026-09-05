// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { clickEndsNoteEditing } from "../noteEditFocus";

function build(html: string) {
  document.body.innerHTML = html;
  return document.getElementById("editor");
}

beforeEach(() => { document.body.innerHTML = ""; });

describe("clickEndsNoteEditing", () => {
  it("keeps editing when the click is inside the editor", () => {
    const editor = build(`<div id="editor"><textarea id="ta"></textarea></div>`);
    expect(clickEndsNoteEditing(document.getElementById("ta"), editor)).toBe(false);
  });

  it("keeps editing when the click is the editor itself", () => {
    const editor = build(`<div id="editor"></div>`);
    expect(clickEndsNoteEditing(editor, editor)).toBe(false);
  });

  it("ends editing when the click lands on the sidebar", () => {
    const editor = build(`<div id="editor"></div><div id="sidebar"><button id="b">Note</button></div>`);
    expect(clickEndsNoteEditing(document.getElementById("b"), editor)).toBe(true);
  });

  // Everything below renders through a portal at the end of <body>, so it is
  // outside the editor element while plainly still being part of editing.
  it.each([
    ["a popover, dropdown or select", `<div data-radix-popper-content-wrapper><button id="x">Pick</button></div>`],
    ["an older portalled primitive", `<div data-radix-portal><button id="x">Pick</button></div>`],
    ["a dialog", `<div role="dialog"><button id="x">Share</button></div>`],
    ["a menu", `<div role="menu"><button id="x">Bold</button></div>`],
    ["a listbox", `<div role="listbox"><button id="x">Serif</button></div>`],
    ["a tooltip", `<div role="tooltip"><span id="x">Import</span></div>`],
  ])("keeps editing for a click inside %s", (_label, portal) => {
    const editor = build(`<div id="editor"></div>${portal}`);
    expect(clickEndsNoteEditing(document.getElementById("x"), editor)).toBe(false);
  });

  it("does not close on a click with no target, or before the editor mounts", () => {
    const editor = build(`<div id="editor"></div>`);
    expect(clickEndsNoteEditing(null, editor)).toBe(false);
    expect(clickEndsNoteEditing(editor, null)).toBe(false);
  });
});
