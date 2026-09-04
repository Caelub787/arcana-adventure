import { describe, it, expect } from "vitest";
import { remapCaret } from "../liveTextSync";

describe("remapCaret", () => {
  it("leaves the caret alone when nothing changed", () => {
    expect(remapCaret("hello world", "hello world", 5)).toBe(5);
  });

  it("leaves the caret alone when the edit is after it", () => {
    // caret sits after "hello", someone appends at the end
    expect(remapCaret("hello world", "hello world!!!", 5)).toBe(5);
  });

  it("shifts the caret when text is inserted before it", () => {
    // caret at end of "world"; "big " inserted before it
    expect(remapCaret("hello world", "hello big world", 11)).toBe(15);
  });

  it("shifts the caret back when text is deleted before it", () => {
    expect(remapCaret("hello big world", "hello world", 15)).toBe(11);
  });

  it("keeps a caret sitting at the start of the untouched tail with that tail", () => {
    const oldT = "one two three";
    const newT = "one TWO three";
    // caret right after "two" is the first char of the untouched " three"
    expect(remapCaret(oldT, newT, 7)).toBe(7);
    // caret right before "two" is the last char of the untouched "one "
    expect(remapCaret(oldT, newT, 4)).toBe(4);
  });

  it("lands at the end of the untouched head when the caret was inside the rewrite", () => {
    // caret between "ab" and "cdef"; "cd" becomes "XYZ" around it
    expect(remapCaret("abcdef", "abXYZef", 3)).toBe(2);
    expect(remapCaret("one two three", "one TWO three", 6)).toBe(4);
  });

  it("never returns a position outside the new text", () => {
    expect(remapCaret("a very long note", "hi", 16)).toBeLessThanOrEqual(2);
    expect(remapCaret("a very long note", "", 10)).toBe(0);
    expect(remapCaret("", "now there is text", 0)).toBe(0);
  });

  it("handles a caret past the end of the old text", () => {
    expect(remapCaret("abc", "abcdef", 99)).toBeLessThanOrEqual(6);
  });
});
