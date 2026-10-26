// @vitest-environment jsdom
/**
 * The hotbar opens on this browser's last copy of itself so its slots are
 * pressable at once. Finding that copy needs a user id, because it is stored
 * per person - and asking the server who you are is a round trip, which is
 * exactly the wait the cache exists to avoid. So the id of whoever signed in
 * last is kept somewhere that can be read without waiting for anything.
 *
 * The risk that buys is showing one person's bar to another, so signing out
 * forgets it, and a mismatch drops the cached copy rather than showing it.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { rememberUser, lastUser, forgetUser, clearSnapshots } from "./snapCache";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("the remembered user", () => {
  it("is there to be read straight away, with no server round trip", () => {
    rememberUser("user-1");
    expect(lastUser()).toBe("user-1");
  });

  it("is nothing at all before anyone has signed in", () => {
    expect(lastUser()).toBe("");
  });

  it("follows whoever signed in most recently", () => {
    rememberUser("user-1");
    rememberUser("user-2");
    expect(lastUser()).toBe("user-2");
  });

  it("ignores an empty id rather than wiping what it knows", () => {
    rememberUser("user-1");
    rememberUser("");
    expect(lastUser()).toBe("user-1");
  });

  it("is forgotten on sign-out, so the next person starts clean", () => {
    rememberUser("user-1");
    forgetUser();
    expect(lastUser()).toBe("");
  });

  it("is forgotten when the saved copies are cleared", async () => {
    rememberUser("user-1");
    await clearSnapshots();
    expect(lastUser()).toBe("");
  });
});

describe("a browser with storage switched off", () => {
  it("reads as nobody rather than throwing", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(lastUser()).toBe("");
  });

  it("lets a write fail quietly - no cache is not a broken app", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
    expect(() => rememberUser("user-1")).not.toThrow();
  });
});

describe("the key a saved hotbar is filed under", () => {
  // What the bar actually does: prefer the signed-in user once known, and
  // fall back to the remembered one on the first render, when it is not.
  const cacheKey = (me: string | null, remembered: string, campaignId: string) => {
    const id = me || remembered;
    return id ? `free-hotbar-cache:${id}:${campaignId}` : null;
  };

  it("is found on the very first render, before the user is known", () => {
    rememberUser("user-1");
    expect(cacheKey(null, lastUser(), "camp-1")).toBe("free-hotbar-cache:user-1:camp-1");
  });

  it("is per campaign, so two campaigns never share a bar", () => {
    expect(cacheKey("user-1", "user-1", "camp-1")).not.toBe(cacheKey("user-1", "user-1", "camp-2"));
  });

  it("is nothing when nobody has signed in on this browser", () => {
    expect(cacheKey(null, lastUser(), "camp-1")).toBeNull();
  });

  it("prefers the signed-in user once the server has said who that is", () => {
    rememberUser("user-1");
    expect(cacheKey("user-2", lastUser(), "camp-1")).toBe("free-hotbar-cache:user-2:camp-1");
  });
});
