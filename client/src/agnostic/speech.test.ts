/**
 * A line typed in chat shows over the head of whoever said it for a few
 * seconds, then fades. The chat log is still the record — this is so you can
 * see who is talking without reading it.
 *
 * What counts as speech matters: a roll, a whisper and the system's own lines
 * are not somebody talking, and putting them over a token would be noise and,
 * for a whisper, a leak.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isSpeech, speechText, said, speechOf, gmSpeech, speechOpacity, onSpeech, forgetSpeech,
  SPEECH_HOLD_MS, SPEECH_FADE_MS, SPEECH_MAX_CHARS, SPEECH_GM_MAX_CHARS,
} from "./speech";

beforeEach(() => forgetSpeech());

describe("what counts as something said", () => {
  const msg = (over: Record<string, unknown> = {}) => ({ userId: "u1", text: "Hold the line!", type: "chat", ...over });

  it("is a person typing in chat", () => {
    expect(isSpeech(msg())).toBe(true);
  });

  it("is not a roll, which the log shows in its own way", () => {
    expect(isSpeech(msg({ type: "roll" }))).toBe(false);
  });

  it("is not the system talking", () => {
    expect(isSpeech(msg({ type: "system" }))).toBe(false);
    expect(isSpeech(msg({ type: "gm-audit" }))).toBe(false);
  });

  it("is never a whisper — that would put a private line over a token", () => {
    expect(isSpeech(msg({ type: "whisper", recipientId: "u2" }))).toBe(false);
    expect(isSpeech(msg({ recipientId: "u2" }))).toBe(false);
  });

  it("is nothing at all without a person behind it", () => {
    expect(isSpeech(msg({ userId: null }))).toBe(false);
  });

  it("is nothing when there are no words in it", () => {
    expect(isSpeech(msg({ text: "   " }))).toBe(false);
    expect(isSpeech(msg({ text: "" }))).toBe(false);
  });
});

describe("the words in the bubble", () => {
  it("are the words that were typed", () => {
    expect(speechText("Hold the line!")).toBe("Hold the line!");
  });

  it("are one line, however they were typed", () => {
    expect(speechText("Hold\n  the\tline")).toBe("Hold the line");
  });

  it("are cut short, because a token is not a page", () => {
    const long = "a".repeat(SPEECH_MAX_CHARS * 2);
    const out = speechText(long);
    expect(out.length).toBeLessThanOrEqual(SPEECH_MAX_CHARS);
    expect(out.endsWith("…")).toBe(true);
  });

  it("are left alone when they just fit", () => {
    const fits = "b".repeat(SPEECH_MAX_CHARS);
    expect(speechText(fits)).toBe(fits);
  });
});

describe("whose bubble it is", () => {
  it("belongs to the person who typed it", () => {
    said("u1", "Over here");
    expect(speechOf("u1")?.text).toBe("Over here");
    expect(speechOf("u2")).toBeNull();
  });

  it("is only ever their latest line", () => {
    said("u1", "First");
    said("u1", "Second");
    expect(speechOf("u1")?.text).toBe("Second");
  });

  it("is nobody's when nobody is named", () => {
    expect(speechOf(null)).toBeNull();
    expect(speechOf(undefined)).toBeNull();
  });

  it("is not kept for a line with no words", () => {
    said("u1", "   ");
    expect(speechOf("u1")).toBeNull();
  });

  it("lets two people talk at once", () => {
    said("u1", "Left");
    said("u2", "Right");
    expect(speechOf("u1")?.text).toBe("Left");
    expect(speechOf("u2")?.text).toBe("Right");
  });
});

describe("fading", () => {
  it("is solid while it is new", () => {
    expect(speechOpacity(1000, 1000)).toBe(1);
    expect(speechOpacity(1000, 1000 + SPEECH_HOLD_MS)).toBe(1);
  });

  it("thins out over the fade", () => {
    const half = speechOpacity(0, SPEECH_HOLD_MS + SPEECH_FADE_MS / 2);
    expect(half).toBeGreaterThan(0.3);
    expect(half).toBeLessThan(0.7);
  });

  it("is gone at the end of it", () => {
    expect(speechOpacity(0, SPEECH_HOLD_MS + SPEECH_FADE_MS)).toBe(0);
    expect(speechOpacity(0, SPEECH_HOLD_MS + SPEECH_FADE_MS * 3)).toBe(0);
  });

  it("stops being anyone's once it has faded", () => {
    said("u1", "Gone soon", "", { at: Date.now() - (SPEECH_HOLD_MS + SPEECH_FADE_MS + 10) });
    expect(speechOf("u1")).toBeNull();
  });
});

describe("watching for someone to speak", () => {
  it("tells the map when a line arrives", () => {
    const heard = vi.fn();
    const stop = onSpeech(heard);
    said("u1", "Listen");
    expect(heard).toHaveBeenCalled();
    stop();
    heard.mockClear();
    said("u1", "And again");
    expect(heard).not.toHaveBeenCalled();
  });

  it("forgets everything when the table is left", () => {
    said("u1", "Still here");
    forgetSpeech();
    expect(speechOf("u1")).toBeNull();
  });
});

/**
 * The GM talks as the table. Their line is kept apart so it can go across the
 * top of the screen rather than over whatever token they happen to own.
 */
describe("when the GM is the one talking", () => {
  beforeEach(forgetSpeech);

  it("keeps it off the tokens", () => {
    said("gm", "The door creaks open.", "Caelub", { gm: true });
    expect(speechOf("gm")?.gm).toBe(true);
    expect(gmSpeech()?.text).toBe("The door creaks open.");
  });

  it("leaves a player's line where it was", () => {
    said("p1", "I draw my sword");
    expect(speechOf("p1")?.gm).toBe(false);
    expect(gmSpeech()).toBeNull();
  });

  it("shows the newest line when two GMs talk", () => {
    said("gm1", "First", "", { gm: true, at: Date.now() - 500 });
    said("gm2", "Second", "", { gm: true });
    expect(gmSpeech()?.text).toBe("Second");
  });

  it("gives the GM room for a longer line, since the top of the screen is wide", () => {
    const long = "word ".repeat(80).trim();
    said("gm", long, "", { gm: true });
    said("p1", long);
    expect(gmSpeech()!.text.length).toBeGreaterThan(speechOf("p1")!.text.length);
    expect(gmSpeech()!.text.length).toBeLessThanOrEqual(SPEECH_GM_MAX_CHARS);
  });

  it("fades like anyone else's", () => {
    said("gm", "Gone", "", { gm: true, at: Date.now() - (SPEECH_HOLD_MS + SPEECH_FADE_MS + 10) });
    expect(gmSpeech()).toBeNull();
  });
});
